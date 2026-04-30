'use client';

import { useMemo } from 'react';
import { Repeat, Calendar, CreditCard, AlertCircle, Clock } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { detectarAssinaturas } from '@/lib/assinaturas';
import { formatarMoeda } from '@/lib/storage';

const FREQ_LABEL: Record<string, string> = {
  mensal:     'Mensal',
  quinzenal:  'Quinzenal',
  semanal:    'Semanal',
};

const FREQ_COLOR: Record<string, string> = {
  mensal:    'bg-purple-500/20 text-purple-300 border-purple-500/30',
  quinzenal: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  semanal:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function diasAte(dateStr: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dateStr + 'T00:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

export default function Assinaturas() {
  const { transacoes, categorias } = useFinanceiroStore();

  const assinaturas = useMemo(
    () => detectarAssinaturas(transacoes),
    [transacoes],
  );

  const custoMensalTotal = useMemo(() => {
    return assinaturas.reduce((soma, a) => {
      const mult = a.frequencia === 'mensal' ? 1 : a.frequencia === 'quinzenal' ? 2 : 4.3;
      return soma + a.valor * mult;
    }, 0);
  }, [assinaturas]);

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <Repeat size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Assinaturas Detectadas</h1>
          <p className="text-xs text-slate-500">Cobranças recorrentes identificadas automaticamente</p>
        </div>
      </div>

      {/* Resumo */}
      {assinaturas.length > 0 && (
        <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">Assinaturas detectadas</p>
              <p className="text-2xl font-bold text-white">{assinaturas.length}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">Custo mensal estimado</p>
              <p className="text-2xl font-bold text-red-400 tabular-nums">{formatarMoeda(custoMensalTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {assinaturas.length === 0 && (
        <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Repeat size={24} className="text-blue-400 opacity-50" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-300 mb-1">Nenhuma assinatura detectada</p>
            <p className="text-xs text-slate-600 max-w-xs">
              Para detectar assinaturas, é necessário ter pelo menos 2 transações de despesa com
              descrição semelhante e intervalo regular (semanal, quinzenal ou mensal).
            </p>
          </div>
          <div className="flex gap-3 mt-1 text-[11px] text-slate-600">
            <span className="flex items-center gap-1"><Clock size={11} /> Mensal: 25–35 dias</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Quinzenal: 12–18 dias</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Semanal: 5–9 dias</span>
          </div>
        </div>
      )}

      {/* Cards de assinaturas */}
      <div className="space-y-3">
        {assinaturas.map((assinatura, i) => {
          const cat      = categorias.find(c => c.id === assinatura.categoria_id);
          const diasProx = diasAte(assinatura.proximaEstimada);
          const urgente  = diasProx <= 3;

          return (
            <div key={i} className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-4">

              {/* Linha superior */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: cat ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}
                  >
                    {cat?.icone || <CreditCard size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate capitalize">
                      {assinatura.descricaoOriginal}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{cat?.nome || 'Sem categoria'}</p>
                  </div>
                </div>

                {/* Valor + badge frequência */}
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-red-400 tabular-nums">
                    {formatarMoeda(assinatura.valor)}
                  </p>
                  <span className={`inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${FREQ_COLOR[assinatura.frequencia]}`}>
                    {FREQ_LABEL[assinatura.frequencia]}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-3" />

              {/* Detalhes */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-slate-600 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-600">Última cobrança</p>
                    <p className="text-xs text-slate-300">{formatDate(assinatura.ultimaCobranca)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`flex-shrink-0 ${urgente ? 'text-red-400' : 'text-slate-600'}`}>
                    {urgente
                      ? <AlertCircle size={12} />
                      : <Calendar size={12} />
                    }
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600">Próxima estimada</p>
                    <p className={`text-xs font-medium ${urgente ? 'text-red-400' : 'text-slate-300'}`}>
                      {formatDate(assinatura.proximaEstimada)}
                      {' '}
                      {diasProx === 0
                        ? <span className="text-[10px]">(hoje)</span>
                        : diasProx > 0
                          ? <span className="text-[10px]">({diasProx}d)</span>
                          : <span className="text-[10px]">(vencida)</span>
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer: total pago + ocorrências */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
                <span className="text-[11px] text-slate-600">
                  {assinatura.ocorrencias} ocorrência{assinatura.ocorrencias !== 1 ? 's' : ''} detectada{assinatura.ocorrencias !== 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-slate-500">
                  Total pago: <span className="font-semibold text-slate-400 tabular-nums">{formatarMoeda(assinatura.totalPago)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nota de rodapé */}
      {assinaturas.length > 0 && (
        <p className="text-[11px] text-slate-700 text-center flex items-center justify-center gap-1">
          <AlertCircle size={10} />
          Detecção baseada em padrão de intervalo e consistência de valor (±20%).
        </p>
      )}
    </div>
  );
}
