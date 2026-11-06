import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { computeElement, type MeasureElement, type MeasureKind, type MeasureSummary } from '../lib/quote'
import { num } from '../lib/format'
import { elementTypes } from '../data/settings'
import { Button, cx, inputCls } from './ui'

const slabModels = ['H8', 'H10', 'H12', 'H14', 'H15', 'H16', 'H18', 'H20', 'H25', 'H30']

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const blankElement = (kind: MeasureKind): MeasureElement => {
  const elementType = kind === 'volume' ? 'Laje' : 'Piso'
  return {
    id: newId(),
    label: '',
    elementType,
    mode: 'dimensoes',
    length: '',
    width: '',
    thicknessCm: kind === 'volume' ? '8' : '',
    count: '1',
    informed: '',
    notes: '',
    slabType: kind === 'volume' ? 'H8' : '',
    diameterM: '',
    stairVolume: '1.5',
  }
}

/** Calculadora de volume (m³) ou área comercial de piso (m²). */
export function MeasureCalculator({
  kind,
  elements,
  margin,
  summary,
  onChange,
  onMargin,
}: {
  kind: MeasureKind
  elements: MeasureElement[]
  margin: string
  summary: MeasureSummary
  onChange: (els: MeasureElement[]) => void
  onMargin: (v: string) => void
}) {
  const unit = kind === 'volume' ? 'm³' : 'm²'
  const results = useMemo(() => elements.map((e) => computeElement(e, kind)), [elements, kind])
  const patch = (id: string, p: Partial<MeasureElement>) =>
    onChange(elements.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const changeType = (id: string, elementType: string) => {
    patch(id, {
      elementType,
      length: '',
      width: '',
      thicknessCm: elementType === 'Laje' ? '8' : '',
      slabType: elementType === 'Laje' ? 'H8' : '',
      diameterM: '',
      stairVolume: elementType === 'Escada' ? '1.5' : '',
    })
  }

  return (
    <div>
      <div className="space-y-3">
        {elements.map((e, i) => {
          const r = results[i]
          const isPillar = e.elementType === 'Pilar'
          const isLinear = ['Viga', 'Sapata', 'Baldrame', 'Viga baldrame'].includes(e.elementType)
          const isPile = kind === 'volume' && (e.elementType.startsWith('Estacas') || e.elementType.toLocaleLowerCase('pt-BR').startsWith('tubul'))
          const isStair = kind === 'volume' && e.elementType === 'Escada'
          const isSlab = kind === 'volume' && e.elementType === 'Laje'
          const slabValue = e.slabType || (e.thicknessCm ? `H${e.thicknessCm}` : 'H8')
          return (
            <div key={e.id} className={cx('rounded-md border p-3', r.error ? 'border-brand/60 bg-brand-soft/40' : 'border-line bg-surface-2')}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-36">
                  <label className="mb-1 block text-xs font-semibold text-muted">Elemento {i + 1}</label>
                  <select aria-label={`Tipo do elemento ${i + 1}`} className={inputCls()} value={e.elementType} onChange={(ev) => changeType(e.id, ev.target.value)}>
                    {elementTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="mb-1 block text-xs font-semibold text-muted">Entrada</label>
                  <select aria-label={`Forma de entrada do elemento ${i + 1}`} className={inputCls()} value={e.mode} onChange={(ev) => patch(e.id, { mode: ev.target.value as MeasureElement['mode'] })}>
                    <option value="dimensoes">Dimensões</option>
                    <option value="informado">{kind === 'volume' ? 'Volume informado' : 'Área informada'}</option>
                  </select>
                </div>
                {e.mode === 'dimensoes' ? (
                  <>
                    {isSlab && (
                      <div className="w-[calc(50%-4px)] sm:w-28">
                        <label className="mb-1 block text-xs font-semibold text-muted">Modelo da laje</label>
                        <select
                          aria-label={`Modelo da laje do elemento ${i + 1}`}
                          className={inputCls()}
                          value={slabValue}
                          onChange={(ev) => patch(e.id, { slabType: ev.target.value, thicknessCm: ev.target.value.slice(1) })}
                        >
                          {slabModels.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                      </div>
                    )}
                    {isStair ? (
                      <div className="w-[calc(50%-4px)] sm:w-36">
                        <label className="mb-1 block text-xs font-semibold text-muted">Estimativa fixa (m³)</label>
                        <select aria-label="Estimativa fixa da escada" className={inputCls()} value={e.stairVolume || '1.5'} onChange={(ev) => patch(e.id, { stairVolume: ev.target.value })}>
                          <option value="1.5">1,5 m³</option>
                          <option value="2">2 m³</option>
                          <option value="3">3 m³</option>
                        </select>
                      </div>
                    ) : isPile ? (
                      <>
                        <NumIn label="Comprimento (m)" value={e.length} onChange={(v) => patch(e.id, { length: v })} />
                        <NumIn label="Espessura / diâmetro (m)" value={e.diameterM ?? ''} onChange={(v) => patch(e.id, { diameterM: v })} />
                      </>
                    ) : (
                      <>
                        <NumIn
                          label={kind === 'volume' && isPillar ? 'Altura (m)' : kind === 'volume' && isLinear ? 'Metro linear (m)' : 'Compr. (m)'}
                          value={e.length}
                          onChange={(v) => patch(e.id, { length: v })}
                        />
                        <NumIn label="Largura (m)" value={e.width} onChange={(v) => patch(e.id, { width: v })} />
                        {kind === 'volume' && <NumIn label="Espessura (cm)" value={e.thicknessCm} onChange={(v) => patch(e.id, { thicknessCm: v })} />}
                      </>
                    )}
                    <NumIn label="Qtd. iguais" value={e.count} onChange={(v) => patch(e.id, { count: v })} narrow />
                  </>
                ) : (
                  <NumIn label={`${kind === 'volume' ? 'Volume' : 'Área'} (${unit})`} value={e.informed} onChange={(v) => patch(e.id, { informed: v })} />
                )}
                <div className="ml-auto flex items-end gap-2">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-muted">Resultado</div>
                    <div className="font-display text-xl font-bold tabular">
                      {r.value !== null ? `${num(r.value, 3)} ${unit}` : '—'}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" aria-label={`Remover elemento ${i + 1}`} onClick={() => onChange(elements.filter((x) => x.id !== e.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <input aria-label={`Observações do elemento ${i + 1}`} placeholder="Observações (opcional): etapa, pavimento, trecho…" className={cx(inputCls(), 'mt-2 h-9 text-sm')} value={e.notes} onChange={(ev) => patch(e.id, { notes: ev.target.value })} />
              {r.error && <p role="alert" className="mt-1 text-xs font-semibold text-brand">{r.error}</p>}
            </div>
          )
        })}
      </div>
      <Button size="sm" className="mt-3" onClick={() => onChange([...elements, blankElement(kind)])}>
        <Plus className="h-4 w-4" /> Adicionar elemento ou etapa
      </Button>

      <div className="mt-4 grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Margem de segurança (%)</label>
          <input inputMode="decimal" className={inputCls(!!summary.marginError)} value={margin} placeholder="Opcional" onChange={(e) => onMargin(e.target.value)} />
          {summary.marginError && <p className="mt-1 text-xs font-semibold text-brand">{summary.marginError}</p>}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label={kind === 'volume' ? 'Volume calculado' : 'Área calculada'} value={`${num(summary.base, 3)} ${unit}`} />
          <Stat label={`Margem (${num(summary.marginPct, 1)}%)`} value={`${num(summary.marginValue, 3)} ${unit}`} />
          <Stat strong label="Estimado p/ orçamento" value={`${num(summary.estimated, 3)} ${unit}`} />
        </dl>
      </div>
      <p className="mt-2 text-xs text-muted">
        {kind === 'volume'
          ? 'Resultados em m³. Laje, vigas, pilares, sapatas, radier, contrapiso, piso, calçada e baldrame usam comprimento/altura × largura × espessura (cm ÷ 100) × quantidade. Estacas/tubulões usam π × (diâmetro ÷ 2)² × comprimento × quantidade. Escadas usam estimativa fixa de 1,5, 2 ou 3 m³ por unidade.'
          : 'Área comercial = comprimento × largura × quantidade. '}
        Os cálculos internos mantêm precisão total; a quantidade cobrada é arredondada para 2 casas decimais. Estimativa geométrica comercial — não substitui o dimensionamento ou a especificação técnica de engenharia.
      </p>
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('rounded px-2 py-2', strong ? 'bg-ink text-bg' : 'bg-surface-2')}>
      <dt className={cx('text-[11px] font-semibold uppercase tracking-wide', strong ? 'text-bg/70' : 'text-muted')}>{label}</dt>
      <dd className="font-display text-lg font-bold tabular sm:text-xl">{value}</dd>
    </div>
  )
}

function NumIn({ label, value, onChange, narrow }: { label: string; value: string; onChange: (v: string) => void; narrow?: boolean }) {
  return (
    <div className={narrow ? 'w-[calc(50%-4px)] sm:w-20' : 'w-[calc(50%-4px)] sm:w-28'}>
      <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
      <input inputMode="decimal" aria-label={label} className={inputCls()} value={value} placeholder="0,00" onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
