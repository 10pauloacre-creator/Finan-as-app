'use client';

type PriorityTone = 'danger' | 'warning' | 'info' | 'success';

export type ItemPrioridadeFinanceira = {
  id: string;
  titulo: string;
  detalhe: string;
  valor?: string;
  quantidade?: number;
  tone: PriorityTone;
};

const TONE_CLASS: Record<PriorityTone, { border: string; bg: string; title: string; badge: string }> = {
  danger: {
    border: 'border-red-500/18',
    bg: 'bg-red-500/[0.06]',
    title: 'text-red-200',
    badge: 'bg-red-500/14 text-red-200',
  },
  warning: {
    border: 'border-amber-500/18',
    bg: 'bg-amber-500/[0.06]',
    title: 'text-amber-100',
    badge: 'bg-amber-500/14 text-amber-100',
  },
  info: {
    border: 'border-sky-500/18',
    bg: 'bg-sky-500/[0.06]',
    title: 'text-sky-100',
    badge: 'bg-sky-500/14 text-sky-100',
  },
  success: {
    border: 'border-emerald-500/18',
    bg: 'bg-emerald-500/[0.06]',
    title: 'text-emerald-100',
    badge: 'bg-emerald-500/14 text-emerald-100',
  },
};

export default function PainelPrioridadesFinanceiras({
  titulo = 'Prioridades financeiras',
  subtitulo,
  itens,
}: {
  titulo?: string;
  subtitulo?: string;
  itens: ItemPrioridadeFinanceira[];
}) {
  const itensVisiveis = itens.filter((item) => (item.quantidade ?? 0) > 0 || item.valor);
  if (itensVisiveis.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-white/8 bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{titulo}</h3>
        {subtitulo && <p className="mt-1 text-xs text-slate-500">{subtitulo}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {itensVisiveis.map((item) => {
          const palette = TONE_CLASS[item.tone];
          return (
            <div key={item.id} className={`rounded-2xl border ${palette.border} ${palette.bg} p-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${palette.title}`}>{item.titulo}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{item.detalhe}</div>
                </div>
                {typeof item.quantidade === 'number' && item.quantidade > 0 && (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${palette.badge}`}>
                    {item.quantidade}
                  </span>
                )}
              </div>
              {item.valor && <div className="mt-3 text-sm font-bold tabular-nums text-white">{item.valor}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
