import type { Registry, SideId } from '../../engine'
import './common.css'

/** Точка стороны. Рисуется только по полям справочника: цвет, светлое кольцо, ромб у одиночки. Рядом всегда есть название. */
export function SideDot({ registry, side, hollow }: { registry: Registry; side: SideId | null; hollow?: boolean }) {
  const def = registry.sides.find((s) => s.id === side)
  if (!def || hollow) return <span aria-hidden="true" className="dot dot-hollow" />
  return <span aria-hidden="true" className={def.solo ? 'dot dot-solo' : def.ring ? 'dot dot-ring' : 'dot'} style={{ background: `var(${def.colorVar})` }} />
}
