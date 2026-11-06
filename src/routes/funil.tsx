import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '../hooks/use-mobile'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Bell, Clock, FileText, KanbanSquare, List, NotebookPen, Pencil, Smartphone, SquareKanban, Trash2, TriangleAlert } from 'lucide-react'
import { useStore } from '../data/store'
import { clientTypes, funnelStages, leadSources, lossReasons, regions, type StageId } from '../data/settings'
import { team, today, userName, type Opportunity } from '../data/fixtures'
import { brl, dateBR, daysBetween, parseDecimal } from '../lib/format'
import { Badge, Button, Card, Drawer, EmptyState, Field, Modal, PageHeader, SegTabs, cx, inputCls } from '../components/ui'
import { Pagination, SortTh, useSortPage } from '../components/table'

export const Route = createFileRoute('/funil')({
  head: () => ({ meta: [{ title: 'Funil comercial — Qualimix CRM' }] }),
  component: Funil,
})

const STALE_DAYS = 7
const stageLabel = (id: StageId) => funnelStages.find((s) => s.id === id)?.label ?? id
const isOpen = (o: Opportunity) => o.stage !== 'fechado' && o.stage !== 'perdido'

function followUp(o: Opportunity) {
  if (!isOpen(o)) return null
  if (o.nextContact && daysBetween(today, o.nextContact) < 0) return { tone: 'red' as const, text: `Atrasado ${-daysBetween(today, o.nextContact)}d` }
  if (o.nextContact && daysBetween(today, o.nextContact) === 0) return { tone: 'warn' as const, text: 'Hoje' }
  if (!o.lastContact || daysBetween(o.lastContact, today) >= STALE_DAYS) return { tone: 'warn' as const, text: 'Sem retorno' }
  return null
}

function Funil() {
  const { opportunities, clients, moveOpportunity, toast } = useStore()
  const isMobile = useIsMobile()
  const [view, setView] = useState<'kanban' | 'tabela'>('kanban')
  useEffect(() => {
    if (isMobile) setView('tabela')
  }, [isMobile])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageId | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [editingLead, setEditingLead] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState<{ opportunityId: string; reportId: string; text: string } | null>(null)
  const [owner, setOwner] = useState('')
  const [source, setSource] = useState('')
  const [period, setPeriod] = useState('')
  const [stage, setStage] = useState('')
  const [losing, setLosing] = useState<{ id: string; reason: string; note: string } | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  const filtered = useMemo(
    () =>
      opportunities.filter(
        (o) => (!owner || o.ownerId === owner) && (!source || o.source === source) && (!stage || o.stage === stage) && (!period || daysBetween(o.enteredAt, today) <= Number(period)),
      ),
    [opportunities, owner, source, period, stage],
  )

  const overdue = filtered.filter((o) => isOpen(o) && o.nextContact && daysBetween(today, o.nextContact) < 0)
  const todayList = filtered.filter((o) => isOpen(o) && o.nextContact && daysBetween(today, o.nextContact) === 0)
  const stale = filtered.filter((o) => isOpen(o) && (!o.lastContact || daysBetween(o.lastContact, today) >= STALE_DAYS))

  const move = (o: Opportunity, to: StageId) => {
    if (to === o.stage) return
    if (to === 'perdido') return setLosing({ id: o.id, reason: '', note: '' })
    if (to === 'fechado') return setClosing(o.id)
    const extra = moveOpportunity(o.id, to, `Etapa alterada: ${stageLabel(o.stage)} → ${stageLabel(to)}`, { lossReason: null })
    if (extra?.startsWith('Bloqueado:')) {
      toast({ tone: 'erro', title: 'Etapa não atualizada', body: extra.replace('Bloqueado:', '').trim() })
      return
    }
    toast({ tone: 'ok', title: 'Etapa atualizada', body: `${o.title}: ${stageLabel(to)}${extra ? `. ${extra}.` : ''}` })
  }

  const t = useSortPage(filtered, { title: (o) => o.title, stage: (o) => funnelStages.findIndex((s) => s.id === o.stage), value: (o) => o.estimatedValue ?? -1, next: (o) => o.nextContact ?? '9999', entered: (o) => o.enteredAt }, { key: 'next', dir: 'asc' }, 10)
  const selected = opportunities.find((o) => o.id === detail)

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Funil comercial"
        description="Acompanhe cada oportunidade do primeiro contato ao fechamento. O fechamento é sempre uma ação explícita."
        actions={<SegTabs label="Visualização" value={view} onChange={setView} options={[{ value: 'kanban', label: <span className="inline-flex items-center gap-1"><SquareKanban className="h-4 w-4" /> Colunas</span> }, { value: 'tabela', label: <span className="inline-flex items-center gap-1"><List className="h-4 w-4" /> Tabela</span> }]} />}
      />

      {(isMobile || view === 'kanban') && (
        <div role="note" className={cx('mb-4 flex items-center gap-2 rounded-md border border-warn/40 bg-surface px-3 py-2 text-sm', !isMobile && 'md:hidden')}>
          <Smartphone className="h-4 w-4 shrink-0 text-warn" />
          <span><strong>Use o modo tabela para celular.</strong> No computador, arraste os cards entre as colunas.</span>
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <AlertBox icon={<TriangleAlert className="h-4 w-4" />} tone="red" title="Follow-ups atrasados" items={overdue} onOpen={setDetail} clientName={clientName} />
        <AlertBox icon={<Bell className="h-4 w-4" />} tone="warn" title="Para hoje" items={todayList} onOpen={setDetail} clientName={clientName} />
        <AlertBox icon={<Clock className="h-4 w-4" />} tone="neutral" title={`Sem contato há ${STALE_DAYS}+ dias`} items={stale} onOpen={setDetail} clientName={clientName} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Responsável" className={cx(inputCls(), 'w-auto')} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Responsável: todos</option>
          {team.filter((u) => u.role === 'Comercial').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select aria-label="Origem" className={cx(inputCls(), 'w-auto')} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Origem: todas</option>
          {leadSources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Período de entrada" className={cx(inputCls(), 'w-auto')} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Entrada: qualquer data</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
        {view === 'tabela' && (
          <select aria-label="Etapa" className={cx(inputCls(), 'w-auto')} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Etapa: todas</option>
            {funnelStages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>

      {opportunities.length === 0 ? (
        <Card><EmptyState icon={<KanbanSquare className="h-6 w-6" />} title="Funil vazio">Nenhuma oportunidade registrada. Os leads cadastrados aparecerão aqui.</EmptyState></Card>
      ) : view === 'kanban' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          <div className="grid auto-cols-[270px] grid-flow-col gap-3">
            {funnelStages.map((s, idx) => {
              const items = filtered.filter((o) => o.stage === s.id)
              const total = items.reduce((a, o) => a + (o.estimatedValue ?? 0), 0)
              return (
                <section
                  key={s.id}
                  aria-label={s.label}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(s.id) } }}
                  onDragLeave={() => setOverStage((x) => (x === s.id ? null : x))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const o = opportunities.find((x) => x.id === (e.dataTransfer.getData('text/plain') || dragId))
                    setDragId(null); setOverStage(null)
                    if (o) move(o, s.id)
                  }}
                  className={cx('flex min-h-[320px] flex-col rounded-lg border border-line bg-surface-2 transition-colors', s.id === 'fechado' && 'border-ok/30', s.id === 'perdido' && 'opacity-80', overStage === s.id && 'border-brand bg-brand/5')}
                >
                  <header className="border-b border-line px-3 py-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold uppercase leading-tight">
                        <span className="mr-1 text-muted">{idx + 1}.</span>
                        {s.label}
                      </h2>
                      <span className="rounded bg-ink px-1.5 text-xs font-bold text-bg">{items.length}</span>
                    </div>
                    <p className="text-xs text-muted tabular">{total ? `${brl(total)} estimados` : '—'}</p>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {items.map((o) => {
                      const f = followUp(o)
                      return (
                        <article
                          key={o.id}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setDragId(o.id) }}
                          onDragEnd={() => { setDragId(null); setOverStage(null) }}
                          className={cx('anim-fade cursor-grab rounded-md border border-line bg-surface p-3 shadow-sm active:cursor-grabbing', dragId === o.id && 'opacity-40')}
                        >
                          <button onClick={() => setDetail(o.id)} className="block w-full text-left">
                            <p className="font-semibold leading-tight hover:text-brand">{o.title}</p>
                            <p className="truncate text-xs text-muted">{clientName(o.clientId)}</p>
                          </button>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="font-display text-lg font-bold tabular">{o.estimatedValue === null ? <span className="text-sm font-semibold text-muted">Valor a definir</span> : brl(o.estimatedValue)}</span>
                            {f && <Badge tone={f.tone} className="ml-auto">{f.text}</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {o.source} · {userName(o.ownerId).split(' ')[0]}
                          </p>
                          {isOpen(o) && <p className="mt-1 text-xs"><span className="font-semibold">Próx.:</span> {o.nextAction} {o.nextContact && `(${dateBR(o.nextContact)})`}</p>}
                          {o.lossReason && <p className="mt-1 text-xs text-brand">Motivo: {o.lossReason}</p>}
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <button onClick={() => setReporting(o.id)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                              <NotebookPen className="h-3.5 w-3.5" /> Relatório{o.reports?.length ? ` (${o.reports.length})` : ''}
                            </button>
                            <button onClick={() => setEditingLead(o.id)} className="inline-flex items-center gap-1 font-semibold text-muted hover:text-brand">
                              <Pencil className="h-3.5 w-3.5" /> Editar lead
                            </button>
                            {o.quoteId && <span className="ml-auto inline-flex items-center gap-1 text-muted"><FileText className="h-3.5 w-3.5" /> Orçamento</span>}
                          </div>
                          <select aria-label={`Mover ${o.title}`} className={cx(inputCls(), 'mt-2 h-8 text-xs')} value={o.stage} onChange={(e) => move(o, e.target.value as StageId)}>
                            {funnelStages.map((x) => <option key={x.id} value={x.id}>{x.id === o.stage ? `Etapa: ${x.label}` : `Mover para: ${x.label}`}</option>)}
                          </select>
                        </article>
                      )
                    })}
                    {!items.length && <p className="px-2 py-6 text-center text-xs text-muted">Nenhuma oportunidade</p>}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-muted">
                <tr>
                  <SortTh label="Oportunidade" k="title" sort={t.sort} toggle={t.toggle} />
                  <SortTh label="Etapa" k="stage" sort={t.sort} toggle={t.toggle} />
                  <SortTh label="Valor estimado" k="value" sort={t.sort} toggle={t.toggle} right />
                  <th className="px-4 py-3 font-bold uppercase tracking-wide">Último contato</th>
                  <SortTh label="Próximo contato" k="next" sort={t.sort} toggle={t.toggle} />
                  <SortTh label="Entrada" k="entered" sort={t.sort} toggle={t.toggle} />
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {t.pageRows.map((o) => {
                  const f = followUp(o)
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <button onClick={() => setDetail(o.id)} className="text-left font-semibold hover:text-brand">{o.title}</button>
                        <span className="block text-xs text-muted">{clientName(o.clientId)} · {o.source} · {userName(o.ownerId)}</span>
                        <button onClick={() => setReporting(o.id)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><NotebookPen className="h-3.5 w-3.5" /> Relatório{o.reports?.length ? ` (${o.reports.length})` : ''}</button>
                      </td>
                      <td className="px-4 py-3">
                        <select aria-label={`Etapa de ${o.title}`} className={cx(inputCls(), 'h-8 w-auto text-xs')} value={o.stage} onChange={(e) => move(o, e.target.value as StageId)}>
                          {funnelStages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular">{o.estimatedValue === null ? '—' : brl(o.estimatedValue)}</td>
                      <td className="px-4 py-3 tabular">{dateBR(o.lastContact)}</td>
                      <td className="px-4 py-3 tabular">
                        {dateBR(o.nextContact)} {f && <Badge tone={f.tone}>{f.text}</Badge>}
                      </td>
                      <td className="px-4 py-3 tabular">{dateBR(o.enteredAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => setEditingLead(o.id)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                          <Button size="sm" onClick={() => setDetail(o.id)}>Abrir</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...t} />
        </Card>
      )}

      <Modal
        open={!!losing}
        onClose={() => setLosing(null)}
        title="Registrar perda"
        footer={
          <>
            <Button onClick={() => setLosing(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!losing?.reason}
              onClick={() => {
                if (!losing) return
                const o = opportunities.find((x) => x.id === losing.id)!
                moveOpportunity(o.id, 'perdido', `Marcada como perdida — motivo: ${losing.reason}${losing.note ? ` (${losing.note})` : ''}`, { lossReason: losing.reason, nextContact: null })
                toast({ tone: 'ok', title: 'Perda registrada', body: o.title })
                setLosing(null)
              }}
            >
              Confirmar perda
            </Button>
          </>
        }
      >
        {losing && (
          <div className="space-y-4">
            <Field label="Motivo da perda" required>
              {(id) => (
                <select id={id} className={inputCls()} value={losing.reason} onChange={(e) => setLosing({ ...losing, reason: e.target.value })}>
                  <option value="">Selecione…</option>
                  {lossReasons.map((r) => <option key={r}>{r}</option>)}
                </select>
              )}
            </Field>
            <Field label="Detalhes (opcional)">{(id) => <textarea id={id} rows={3} className={cx(inputCls(), 'h-auto py-2')} value={losing.note} onChange={(e) => setLosing({ ...losing, note: e.target.value })} />}</Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title="Confirmar fechamento"
        footer={
          <>
            <Button onClick={() => setClosing(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                const o = opportunities.find((x) => x.id === closing)!
                moveOpportunity(o.id, 'fechado', `Fechamento confirmado: ${stageLabel(o.stage)} → Fechado`, { nextContact: null, lossReason: null })
                toast({ tone: 'ok', title: 'Oportunidade fechada', body: o.title })
                setClosing(null)
              }}
            >
              Confirmar fechamento
            </Button>
          </>
        }
      >
        <p className="text-sm">Confirme que o cliente aceitou a proposta. Gerar ou enviar um orçamento não fecha a oportunidade automaticamente.</p>
      </Modal>

      {reporting && <ReportModal key={`${reporting}-new`} id={reporting} onClose={() => setReporting(null)} />}
      {editingReport && <ReportModal key={`${editingReport.opportunityId}-${editingReport.reportId}`} id={editingReport.opportunityId} report={{ id: editingReport.reportId, text: editingReport.text }} onClose={() => setEditingReport(null)} />}
      {editingLead && <LeadEditModal key={editingLead} id={editingLead} onClose={() => setEditingLead(null)} />}

      {selected && <OpportunityDrawer o={selected} onClose={() => setDetail(null)} clientName={clientName(selected.clientId)} onMove={(to) => move(selected, to)} onEdit={() => setEditingLead(selected.id)} onEditReport={(report) => setEditingReport({ opportunityId: selected.id, reportId: report.id ?? report.at, text: report.text })} />}
    </>
  )
}

function AlertBox({ title, items, tone, icon, onOpen, clientName }: { title: string; items: Opportunity[]; tone: 'red' | 'warn' | 'neutral'; icon: React.ReactNode; onOpen: (id: string) => void; clientName: (id: string) => string }) {
  return (
    <div className={cx('rounded-lg border bg-surface p-4', tone === 'red' && items.length ? 'border-brand/40' : tone === 'warn' && items.length ? 'border-warn/40' : 'border-line')}>
      <p className={cx('mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide', tone === 'red' ? 'text-brand' : tone === 'warn' ? 'text-warn' : 'text-muted')}>
        {icon} {title} <span className="ml-auto font-display text-2xl text-ink">{items.length}</span>
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nada pendente.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 3).map((o) => (
            <li key={o.id}>
              <button onClick={() => onOpen(o.id)} className="w-full truncate text-left hover:text-brand">
                <span className="font-semibold">{o.title}</span> <span className="text-muted">· {clientName(o.clientId)}</span>
              </button>
            </li>
          ))}
          {items.length > 3 && <li className="text-xs text-muted">+ {items.length - 3} outras</li>}
        </ul>
      )}
    </div>
  )
}

function OpportunityDrawer({ o, onClose, clientName, onMove, onEdit, onEditReport }: {
  o: Opportunity
  onClose: () => void
  clientName: string
  onMove: (to: StageId) => void
  onEdit: () => void
  onEditReport: (report: { id?: string; at: string; by: string; text: string }) => void
}) {
  const { updateOpportunity, toast, quotes } = useStore()
  const quoteNumber = quotes.find((q) => q.id === o.quoteId)?.number
  const [next, setNext] = useState(o.nextContact ?? '')
  const [action, setAction] = useState(o.nextAction)
  const [contactDate, setContactDate] = useState(o.lastContact ?? today)
  const [note, setNote] = useState('')
  useEffect(() => {
    setNext(o.nextContact ?? '')
    setAction(o.nextAction)
    setContactDate(o.lastContact ?? today)
  }, [o.id, o.nextContact, o.nextAction, o.lastContact])

  return (
    <Drawer open onClose={onClose} title="Oportunidade">
      <div className="space-y-5">
        <div>
          <h3 className="text-3xl font-extrabold uppercase leading-none">{o.title}</h3>
          <p className="mt-1 text-sm text-muted">{clientName} · {o.source} · {userName(o.ownerId)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={o.stage === 'fechado' ? 'ok' : o.stage === 'perdido' ? 'red' : 'dark'}>{stageLabel(o.stage)}</Badge>
            <Badge>{o.estimatedValue === null ? 'Valor a definir' : brl(o.estimatedValue)}</Badge>
            {quoteNumber && <Link to="/orcamentos" search={{ q: quoteNumber }} className="text-xs font-semibold text-brand hover:underline">Ver orçamento {quoteNumber}</Link>}
            <Button size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Editar lead</Button>
          </div>
        </div>
        <Field label="Etapa">
          {(id) => (
            <select id={id} className={inputCls()} value={o.stage} onChange={(e) => onMove(e.target.value as StageId)}>
              {funnelStages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
        </Field>
        <div className="rounded-md border border-line p-4">
          <h4 className="mb-3 text-lg font-bold uppercase">Registrar contato e próximo passo</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Próxima ação">{(id) => <input id={id} className={inputCls()} value={action} onChange={(e) => setAction(e.target.value)} />}</Field>
            <Field label="Data do próximo contato">{(id) => <input id={id} type="date" className={inputCls()} value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
            <Field label="Data do último contato">{(id) => <input id={id} type="date" className={inputCls()} value={contactDate} onChange={(e) => setContactDate(e.target.value)} />}</Field>
            <Field label="Resumo do contato de hoje (opcional)" className="sm:col-span-2">{(id) => <textarea id={id} rows={2} className={cx(inputCls(), 'h-auto py-2')} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          </div>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => {
              updateOpportunity(o.id, { lastContact: contactDate || null, nextContact: next || null, nextAction: action }, `Contato atualizado${note ? `: ${note}` : ''}${contactDate ? ` · contato em ${dateBR(contactDate)}` : ''}${next ? ` · próximo em ${dateBR(next)}` : ''}`)
              setNote('')
              toast({ tone: 'ok', title: 'Contato registrado' })
            }}
          >
            Registrar contato
          </Button>
        </div>
        <ReportList o={o} onEdit={onEditReport} />
        <section>
          <h4 className="mb-2 text-lg font-bold uppercase">Histórico</h4>
          <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
            {o.history.map((h, i) => (
              <li key={i}>
                <p className="font-medium">{h.text}</p>
                <p className="text-xs text-muted">{dateBR(h.at)} · {userName(h.by)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Drawer>
  )
}


function LeadEditModal({ id, onClose }: { id: string; onClose: () => void }) {
  const {
    opportunities,
    clients,
    sites,
    updateClient,
    updateSite,
    updateOpportunity,
    toast,
  } = useStore()
  const opportunity = opportunities.find((item) => item.id === id)
  const client = clients.find((item) => item.id === opportunity?.clientId)
  const [title, setTitle] = useState(opportunity?.title ?? '')
  const [name, setName] = useState(client?.name ?? '')
  const [tradeName, setTradeName] = useState(client?.tradeName ?? '')
  const [document, setDocument] = useState(client?.document ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [city, setCity] = useState(client?.city ?? '')
  const [region, setRegion] = useState(client?.region ?? '')
  const [clientType, setClientType] = useState(client?.type ?? '')
  const [clientNotes, setClientNotes] = useState(client?.notes ?? '')
  const [source, setSource] = useState(opportunity?.source ?? '')
  const [ownerId, setOwnerId] = useState(opportunity?.ownerId ?? '')
  const [siteId, setSiteId] = useState(opportunity?.siteId ?? '')
  const [estimatedValue, setEstimatedValue] = useState(opportunity?.estimatedValue?.toString() ?? '')
  const [lastContact, setLastContact] = useState(opportunity?.lastContact ?? '')
  const [nextContact, setNextContact] = useState(opportunity?.nextContact ?? '')
  const [nextAction, setNextAction] = useState(opportunity?.nextAction ?? '')
  const [siteName, setSiteName] = useState(sites.find((site) => site.id === opportunity?.siteId)?.name ?? '')
  const [siteAddress, setSiteAddress] = useState(sites.find((site) => site.id === opportunity?.siteId)?.address ?? '')
  const [siteCity, setSiteCity] = useState(sites.find((site) => site.id === opportunity?.siteId)?.city ?? '')
  const [siteRegion, setSiteRegion] = useState(sites.find((site) => site.id === opportunity?.siteId)?.region ?? '')
  const [siteAccess, setSiteAccess] = useState(sites.find((site) => site.id === opportunity?.siteId)?.accessNotes ?? '')
  const [siteContact, setSiteContact] = useState(sites.find((site) => site.id === opportunity?.siteId)?.contactName ?? '')
  const [sitePhone, setSitePhone] = useState(sites.find((site) => site.id === opportunity?.siteId)?.contactPhone ?? '')
  const [siteService, setSiteService] = useState(sites.find((site) => site.id === opportunity?.siteId)?.serviceType ?? '')
  const [siteRestrictions, setSiteRestrictions] = useState(sites.find((site) => site.id === opportunity?.siteId)?.restrictions ?? '')
  const [error, setError] = useState('')

  if (!opportunity || !client) return null

  const clientSites = sites.filter((site) => site.clientId === client.id)
  const selectedSite = sites.find((site) => site.id === siteId)

  const save = () => {
    const value = parseDecimal(estimatedValue)
    if (!title.trim()) return setError('Informe o nome da oportunidade.')
    if (!name.trim()) return setError('Informe o nome do cliente.')
    if (!value.ok) return setError('O valor estimado precisa ser numérico.')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Confira o endereço de e-mail.')

    updateClient(client.id, {
      name: name.trim(),
      tradeName: tradeName.trim(),
      document: document.replace(/\D/g, ''),
      phone: phone.replace(/\D/g, ''),
      whatsapp: whatsapp.replace(/\D/g, ''),
      email: email.trim(),
      address: address.trim(),
      city: city.trim(),
      region,
      type: clientType,
      notes: clientNotes.trim(),
      source,
      ownerId,
    })

    if (selectedSite) {
      updateSite(selectedSite.id, {
        name: siteName.trim() || selectedSite.name,
        address: siteAddress.trim(),
        city: siteCity.trim(),
        region: siteRegion,
        accessNotes: siteAccess.trim(),
        contactName: siteContact.trim(),
        contactPhone: sitePhone.replace(/\D/g, ''),
        serviceType: siteService.trim(),
        restrictions: siteRestrictions.trim(),
      })
    }

    updateOpportunity(id, {
      title: title.trim(),
      source,
      ownerId,
      siteId: siteId || null,
      estimatedValue: value.value,
      lastContact: lastContact || null,
      nextContact: nextContact || null,
      nextAction: nextAction.trim(),
    }, 'Lead, cliente e dados de atendimento editados')
    toast({ tone: 'ok', title: 'Lead atualizado', body: 'Dados comerciais, contato e obra foram salvos.' })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar lead e cliente"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar alterações</Button></>}
      size="xl"
    >
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide">Oportunidade comercial</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do lead / oportunidade" className="sm:col-span-2">
              {(fid) => <input id={fid} className={inputCls()} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Valor estimado (R$)" hint="Opcional; não altera os valores do orçamento.">
              {(fid) => <input id={fid} inputMode="decimal" className={inputCls()} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="Sem valor definido" />}
            </Field>
            <Field label="Origem do lead">
              {(fid) => <select id={fid} className={inputCls()} value={source} onChange={(e) => setSource(e.target.value)}>{leadSources.map((item) => <option key={item}>{item}</option>)}</select>}
            </Field>
            <Field label="Responsável comercial">
              {(fid) => <select id={fid} className={inputCls()} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{team.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            </Field>
            <Field label="Obra relacionada">
              {(fid) => <select id={fid} className={inputCls()} value={siteId} onChange={(e) => {
                const nextId = e.target.value
                setSiteId(nextId)
                const nextSite = sites.find((item) => item.id === nextId)
                if (nextSite) {
                  setSiteName(nextSite.name)
                  setSiteAddress(nextSite.address)
                  setSiteCity(nextSite.city)
                  setSiteRegion(nextSite.region)
                  setSiteAccess(nextSite.accessNotes)
                  setSiteContact(nextSite.contactName)
                  setSitePhone(nextSite.contactPhone)
                  setSiteService(nextSite.serviceType)
                  setSiteRestrictions(nextSite.restrictions)
                }
              }}><option value="">Sem obra vinculada</option>{clientSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            </Field>
            <Field label="Próxima ação">
              {(fid) => <input id={fid} className={inputCls()} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />}
            </Field>
            <Field label="Último contato">
              {(fid) => <input id={fid} type="date" className={inputCls()} value={lastContact} onChange={(e) => setLastContact(e.target.value)} />}
            </Field>
            <Field label="Próximo contato / retorno">
              {(fid) => <input id={fid} type="date" className={inputCls()} value={nextContact} onChange={(e) => setNextContact(e.target.value)} />}
            </Field>
          </div>
        </section>

        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide">Cadastro do cliente</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome / razão social" className="sm:col-span-2">
              {(fid) => <input id={fid} className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Nome fantasia">
              {(fid) => <input id={fid} className={inputCls()} value={tradeName} onChange={(e) => setTradeName(e.target.value)} />}
            </Field>
            <Field label="Tipo de cliente">
              {(fid) => <select id={fid} className={inputCls()} value={clientType} onChange={(e) => setClientType(e.target.value)}><option value="">Não informado</option>{clientTypes.map((item) => <option key={item}>{item}</option>)}</select>}
            </Field>
            <Field label="CPF / CNPJ">
              {(fid) => <input id={fid} className={inputCls()} value={document} onChange={(e) => setDocument(e.target.value)} />}
            </Field>
            <Field label="Telefone">
              {(fid) => <input id={fid} className={inputCls()} value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <Field label="WhatsApp">
              {(fid) => <input id={fid} className={inputCls()} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />}
            </Field>
            <Field label="E-mail">
              {(fid) => <input id={fid} type="email" className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Endereço">
              {(fid) => <input id={fid} className={inputCls()} value={address} onChange={(e) => setAddress(e.target.value)} />}
            </Field>
            <Field label="Cidade">
              {(fid) => <input id={fid} className={inputCls()} value={city} onChange={(e) => setCity(e.target.value)} />}
            </Field>
            <Field label="Região">
              {(fid) => <select id={fid} className={inputCls()} value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Não informado</option>{regions.map((item) => <option key={item}>{item}</option>)}</select>}
            </Field>
            <Field label="Observações do cadastro" className="sm:col-span-2">
              {(fid) => <textarea id={fid} rows={3} className={cx(inputCls(), 'h-auto py-2')} value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />}
            </Field>
          </div>
        </section>

        {selectedSite && (
          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide">Dados da obra</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da obra">
                {(fid) => <input id={fid} className={inputCls()} value={siteName} onChange={(e) => setSiteName(e.target.value)} />}
              </Field>
              <Field label="Endereço da obra">
                {(fid) => <input id={fid} className={inputCls()} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />}
              </Field>
              <Field label="Cidade da obra">
                {(fid) => <input id={fid} className={inputCls()} value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />}
              </Field>
              <Field label="Região da obra">
                {(fid) => <select id={fid} className={inputCls()} value={siteRegion} onChange={(e) => setSiteRegion(e.target.value)}><option value="">Não informada</option>{regions.map((item) => <option key={item}>{item}</option>)}</select>}
              </Field>
              <Field label="Contato na obra">
                {(fid) => <input id={fid} className={inputCls()} value={siteContact} onChange={(e) => setSiteContact(e.target.value)} />}
              </Field>
              <Field label="Telefone do contato">
                {(fid) => <input id={fid} className={inputCls()} value={sitePhone} onChange={(e) => setSitePhone(e.target.value)} />}
              </Field>
              <Field label="Serviço procurado">
                {(fid) => <input id={fid} className={inputCls()} value={siteService} onChange={(e) => setSiteService(e.target.value)} />}
              </Field>
              <Field label="Acesso à obra" className="sm:col-span-2">
                {(fid) => <textarea id={fid} rows={2} className={cx(inputCls(), 'h-auto py-2')} value={siteAccess} onChange={(e) => setSiteAccess(e.target.value)} />}
              </Field>
              <Field label="Restrições / observações da obra" className="sm:col-span-2">
                {(fid) => <textarea id={fid} rows={2} className={cx(inputCls(), 'h-auto py-2')} value={siteRestrictions} onChange={(e) => setSiteRestrictions(e.target.value)} />}
              </Field>
            </div>
          </section>
        )}
        {error && <p role="alert" className="rounded-md bg-brand-soft p-3 text-sm text-brand">{error}</p>}
      </div>
    </Modal>
  )
}

function ReportList({ o, onEdit }: { o: Opportunity; onEdit?: (report: { id?: string; at: string; by: string; text: string }) => void }) {
  const { deleteReport, toast } = useStore()
  if (!o.reports?.length) return <p className="text-sm text-muted">Nenhum relatório registrado.</p>
  return (
    <section>
      <h4 className="mb-2 text-lg font-bold uppercase">Relatórios de atendimento</h4>
      <ul className="space-y-2 text-sm">
        {o.reports.map((r, i) => (
          <li key={r.id ?? r.at ?? i} className="rounded-md border border-line bg-surface-2 p-3">
            <p className="whitespace-pre-wrap">{r.text}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">{dateBR(r.at)} · {userName(r.by)}</p>
              <div className="flex gap-1">
                {onEdit && <Button size="sm" onClick={() => onEdit(r)}><Pencil className="h-3 w-3" /> Editar</Button>}
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm('Excluir este relatório de atendimento?')) {
                    deleteReport(o.id, r.id ?? r.at)
                    toast({ tone: 'ok', title: 'Relatório removido' })
                  }
                }}><Trash2 className="h-3 w-3" /> Excluir</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReportModal({ id, onClose, report }: { id: string; onClose: () => void; report?: { id: string; text: string } }) {
  const { opportunities, clients, addReport, updateReport, toast } = useStore()
  const o = opportunities.find((x) => x.id === id)
  const [needs, setNeeds] = useState(report?.text ?? '')
  const [obs, setObs] = useState('')
  if (!o) return null
  const c = clients.find((x) => x.id === o.clientId)
  const text = report ? needs.trim() : [needs.trim() && `Necessidades do cliente: ${needs.trim()}`, obs.trim() && `Observações do atendimento: ${obs.trim()}`].filter(Boolean).join('\n')
  return (
    <Modal
      open
      onClose={onClose}
      title={report ? 'Editar relatório de atendimento' : 'Relatório do atendimento'}
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="primary" disabled={!text} onClick={() => {
            if (report) updateReport(o.id, report.id, text)
            else addReport(o.id, text)
            toast({ tone: 'ok', title: report ? 'Relatório atualizado' : 'Relatório salvo', body: o.title })
            onClose()
          }}>
            {report ? 'Salvar alterações' : 'Salvar relatório'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{o.title} · {c?.name}{c?.phone ? ` · ${c.phone}` : ''}</p>
        {report ? <Field label="Relatório de atendimento">{(fid) => <textarea id={fid} rows={7} className={cx(inputCls(), 'h-auto py-2')} value={needs} onChange={(e) => setNeeds(e.target.value)} />}</Field> : <><Field label="Necessidades do cliente">{(fid) => <textarea id={fid} rows={3} className={cx(inputCls(), 'h-auto py-2')} placeholder="Ex.: laje de 80 m², concreto FCK 25, precisa de bomba" value={needs} onChange={(e) => setNeeds(e.target.value)} />}</Field><Field label="Observações do atendimento">{(fid) => <textarea id={fid} rows={3} className={cx(inputCls(), 'h-auto py-2')} placeholder="Ex.: cliente pediu retorno à tarde, obra começa em 2 semanas" value={obs} onChange={(e) => setObs(e.target.value)} />}</Field></>}
        <ReportList o={o} />
      </div>
    </Modal>
  )
}
