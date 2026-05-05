'use client';

import { useMemo, useState } from 'react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { isSameFinancialMonth, parseFinancialDate } from '@/lib/date';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingDown, TrendingUp, Lightbulb, Download,
  Brain, FileText, AlertCircle, CheckCircle,
} from 'lucide-react';
import type { Transacao, Categoria, ContaBancaria, CartaoCredito } from '@/types';
import AIModelSelect from '@/components/ui/AIModelSelect';

const CORES = ['#7C3AED','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#F97316'];
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_NOMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// ─── Tipos do Relatório IA ────────────────────────────────────────────────────

interface Destaque {
  tipo: 'positivo' | 'negativo' | 'neutro';
  titulo: string;
  descricao: string;
}

interface Recomendacao {
  prioridade: 'alta' | 'media' | 'baixa';
  acao: string;
  motivo: string;
}

interface RelatorioIAData {
  resumo: string;
  nota_mes: 'ótimo' | 'bom' | 'regular' | 'ruim';
  destaques: Destaque[];
  recomendacoes: Recomendacao[];
  previsao_proximo_mes: string;
  mes: number;
  ano: number;
}

interface RelatorioCache {
  ts: number;
  data: RelatorioIAData;
}

const TTL_RELATORIO = 24 * 60 * 60 * 1000; // 24h

// ─── Helper: contexto de um mês específico ────────────────────────────────────

function contextoMes(
  transacoes: Transacao[],
  categorias: Categoria[],
  contas: ContaBancaria[],
  cartoes: CartaoCredito[],
  mes: number,
  ano: number,
): string {
  const txMes = transacoes.filter(t => {
    return isSameFinancialMonth(t.data, mes, ano);
  });

  const despesasMes = txMes.filter(t => t.tipo === 'despesa');
  const receitasMes = txMes.filter(t => t.tipo === 'receita');
  const totalDespesas = despesasMes.reduce((s, t) => s + t.valor, 0);
  const totalReceitas = receitasMes.reduce((s, t) => s + t.valor, 0);

  const porCategoria = new Map<string, number>();
  for (const t of despesasMes) {
    porCategoria.set(t.categoria_id, (porCategoria.get(t.categoria_id) ?? 0) + t.valor);
  }

  const topCats = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([catId, valor]) => {
      const cat = categorias.find(c => c.id === catId);
      return `${cat?.nome ?? catId}: ${formatarMoeda(valor)}`;
    });

  const recentes = txMes
    .slice(0, 15)
    .map(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      return `${t.data} | ${t.tipo === 'despesa' ? '-' : '+'}${formatarMoeda(t.valor)} | ${t.descricao} | ${cat?.nome ?? ''}`;
    });

  const saldos = contas.map(c => `${c.nome}: ${formatarMoeda(c.saldo)}`).join(', ');
  const faturas = cartoes.map(c => `${c.nome}: fatura ${formatarMoeda(c.fatura_atual)} / limite ${formatarMoeda(c.limite)}`).join(', ');

  return [
    `=== Relatório Mensal — ${MESES_NOMES[mes - 1]}/${ano} ===`,
    `Total despesas: ${formatarMoeda(totalDespesas)}`,
    `Total receitas: ${formatarMoeda(totalReceitas)}`,
    `Saldo do mês: ${formatarMoeda(totalReceitas - totalDespesas)}`,
    `Quantidade de transações: ${txMes.length}`,
    ``,
    `Top categorias de gasto:`,
    ...topCats.map(c => `  - ${c}`),
    ``,
    `Transações do mês:`,
    ...recentes.map(r => `  ${r}`),
    saldos ? `\nContas bancárias: ${saldos}` : '',
    faturas ? `Cartões: ${faturas}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Componente RelatorioIA ────────────────────────────────────────────────────

function RelatorioIA() {
  const { transacoes, categorias, contas, cartoes, config, atualizarConfig } = useFinanceiroStore();
  const hoje = new Date();

  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const [relatorio, setRelatorio] = useState<RelatorioIAData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function cacheKey(mes: number, ano: number) {
    return `relatorio_${mes}_${ano}`;
  }

  function lerCache(mes: number, ano: number): RelatorioIAData | null {
    try {
      const raw = localStorage.getItem(cacheKey(mes, ano));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RelatorioCache;
      if (Date.now() - parsed.ts > TTL_RELATORIO) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function salvarCache(mes: number, ano: number, data: RelatorioIAData) {
    try {
      const cache: RelatorioCache = { ts: Date.now(), data };
      localStorage.setItem(cacheKey(mes, ano), JSON.stringify(cache));
    } catch {
      // ignore
    }
  }

  async function gerarRelatorio() {
    setErro(null);

    const cached = lerCache(mesSel, anoSel);
    if (cached) {
      setRelatorio(cached);
      return;
    }

    setLoading(true);
    try {
      const contexto = contextoMes(transacoes, categorias, contas, cartoes, mesSel, anoSel);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'resumo_mensal',
          mode: (config.ai_modelo_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto',
          provider: config.ai_modelo_padrao || 'automatico',
          input: { contexto, mes: mesSel, ano: anoSel },
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as RelatorioIAData;
      setRelatorio(data);
      salvarCache(mesSel, anoSel, data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  const notaCores: Record<string, string> = {
    'ótimo': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'bom':   'bg-green-500/15 text-green-300 border-green-500/30',
    'regular': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'ruim':  'bg-red-500/15 text-red-300 border-red-500/30',
  };

  const destaqueCores: Record<string, string> = {
    positivo: 'border-l-emerald-500 bg-emerald-500/5',
    negativo: 'border-l-red-500 bg-red-500/5',
    neutro:   'border-l-slate-500 bg-slate-500/5',
  };

  const prioridadeCores: Record<string, string> = {
    alta:  'bg-red-500/15 text-red-300 border border-red-500/30',
    media: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    baixa: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  };

  return (
    <div className="space-y-5">
      {/* Seletor de mes/ano + botao */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px]">
          <AIModelSelect
            task="report"
            value={config.ai_modelo_padrao || 'automatico'}
            onChange={(value) => atualizarConfig({ ai_modelo_padrao: value })}
          />
        </div>
        <select
          value={mesSel}
          onChange={e => { setMesSel(Number(e.target.value)); setRelatorio(null); }}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
        >
          {MESES_NOMES.map((nome, i) => (
            <option key={i + 1} value={i + 1}>{nome}</option>
          ))}
        </select>
        <select
          value={anoSel}
          onChange={e => { setAnoSel(Number(e.target.value)); setRelatorio(null); }}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
        >
          {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={gerarRelatorio}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 transition-all"
        >
          <Brain size={15} className={loading ? 'animate-pulse' : ''} />
          {loading ? 'Gerando...' : 'Gerar Relatório'}
        </button>
      </div>

      {/* Erro */}
      {erro && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0F1629] p-8 text-center space-y-3">
          <Brain size={28} className="mx-auto text-purple-400 animate-pulse" />
          <p className="text-sm text-slate-400">Analisando seus dados financeiros...</p>
          <p className="text-xs text-slate-600">A IA está preparando seu relatório personalizado</p>
        </div>
      )}

      {/* Resultado */}
      {relatorio && !loading && (
        <div className="space-y-4">
          {/* Header card: mes + nota */}
          <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                {MESES_NOMES[relatorio.mes - 1]} {relatorio.ano}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Relatório gerado pela IA</p>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border capitalize ${notaCores[relatorio.nota_mes] ?? notaCores['regular']}`}>
              {relatorio.nota_mes}
            </span>
          </div>

          {/* Resumo narrativo */}
          <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} className="text-purple-400" />
              <h4 className="text-sm font-semibold text-slate-300">Resumo do Mês</h4>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{relatorio.resumo}</p>
          </div>

          {/* Destaques */}
          {relatorio.destaques?.length > 0 && (
            <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Destaques</h4>
              <div className="space-y-3">
                {relatorio.destaques.map((d, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border-l-4 pl-4 pr-3 py-3 ${destaqueCores[d.tipo] ?? destaqueCores['neutro']}`}
                  >
                    <div className="flex items-start gap-2">
                      {d.tipo === 'positivo'
                        ? <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                        : d.tipo === 'negativo'
                        ? <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                        : <FileText size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className="text-sm font-semibold text-white">{d.titulo}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{d.descricao}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recomendacoes */}
          {relatorio.recomendacoes?.length > 0 && (
            <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Recomendacoes</h4>
              <div className="space-y-3">
                {relatorio.recomendacoes.map((r, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-white leading-snug">{r.acao}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${prioridadeCores[r.prioridade] ?? prioridadeCores['media']}`}>
                        {r.prioridade}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{r.motivo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previsao proximo mes */}
          {relatorio.previsao_proximo_mes && (
            <div className="bg-purple-950/20 border border-purple-800/30 rounded-2xl p-4 flex items-start gap-3">
              <TrendingUp size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-purple-400 mb-1">
                  Previsao para {MESES_NOMES[relatorio.mes % 12]} {relatorio.mes === 12 ? relatorio.ano + 1 : relatorio.ano}
                </p>
                <p className="text-sm text-slate-300 italic leading-relaxed">{relatorio.previsao_proximo_mes}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial */}
      {!relatorio && !loading && !erro && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center space-y-2">
          <Brain size={28} className="mx-auto text-slate-600" />
          <p className="text-sm text-slate-500">Selecione o mês e clique em "Gerar Relatório"</p>
          <p className="text-xs text-slate-700">A IA analisa seus dados e gera insights personalizados</p>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Relatorios() {
  const { transacoes, categorias } = useFinanceiroStore();
  const [anoSel, setAnoSel] = useState(new Date().getFullYear());
  const [exportando, setExportando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'graficos' | 'relatorio'>('graficos');

  const dadosAnuais = useMemo(() => {
    return MESES.map((nome, i) => {
      const mes = i + 1;
      const doMes = transacoes.filter(t => {
        return isSameFinancialMonth(t.data, mes, anoSel);
      });
      const receitas = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
      const despesas = doMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
      return { nome, receitas, despesas, saldo: receitas - despesas };
    });
  }, [transacoes, anoSel]);

  const mesAtualNum = new Date().getMonth() + 1;
  const dadosMesAtual = useMemo(() => {
    return transacoes.filter(t => {
      return isSameFinancialMonth(t.data, mesAtualNum, anoSel);
    });
  }, [transacoes, mesAtualNum, anoSel]);

  const porCategoria = useMemo(() => {
    const mapa: Record<string, { valor: number; catId: string }> = {};
    dadosMesAtual.filter(t => t.tipo === 'despesa').forEach(t => {
      if (!mapa[t.categoria_id]) mapa[t.categoria_id] = { valor: 0, catId: t.categoria_id };
      mapa[t.categoria_id].valor += t.valor;
    });
    const total = Object.values(mapa).reduce((s, v) => s + v.valor, 0);
    return Object.entries(mapa)
      .sort(([,a],[,b]) => b.valor - a.valor)
      .map(([catId, { valor }]) => {
        const cat = categorias.find(c => c.id === catId);
        return {
          nome: cat?.nome || 'Outros',
          icone: cat?.icone || '💳',
          valor,
          percentual: total > 0 ? (valor / total * 100).toFixed(1) : '0',
        };
      });
  }, [dadosMesAtual, categorias]);

  const assinaturas = useMemo(() => {
    return dadosMesAtual.filter(t =>
      t.categoria_id === 'assinaturas' ||
      t.descricao?.toLowerCase().match(/netflix|spotify|amazon|disney|hbo|youtube|apple|google/)
    );
  }, [dadosMesAtual]);

  const totalAno = dadosAnuais.reduce((s, m) => ({
    receitas: s.receitas + m.receitas,
    despesas: s.despesas + m.despesas,
  }), { receitas: 0, despesas: 0 });

  async function exportarPDF() {
    setExportando(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const nomeMes = MESES[mesAtualNum - 1];

      doc.setFillColor(124, 58, 237);
      doc.rect(0, 0, 210, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('FinanceiroIA', 14, 12);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Relatório — ${nomeMes}/${anoSel}`, 14, 21);
      doc.setTextColor(0, 0, 0);

      const totalMes = { receitas: 0, despesas: 0 };
      dadosMesAtual.forEach(t => {
        if (t.tipo === 'receita') totalMes.receitas += t.valor;
        else totalMes.despesas += t.valor;
      });
      const saldo = totalMes.receitas - totalMes.despesas;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Resumo de ${nomeMes}/${anoSel}`, 14, 38);

      autoTable(doc, {
        startY: 43,
        head: [['', 'Valor']],
        body: [
          ['Receitas', formatarMoeda(totalMes.receitas)],
          ['Despesas', formatarMoeda(totalMes.despesas)],
          ['Saldo', formatarMoeda(saldo)],
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [124, 58, 237] },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (data) => {
          if (data.row.index === 2) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = saldo >= 0 ? [16, 185, 129] : [239, 68, 68];
          }
        },
      });

      if (porCategoria.length > 0) {
        const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Despesas por Categoria', 14, finalY1);

        autoTable(doc, {
          startY: finalY1 + 5,
          head: [['Categoria', 'Valor', '%']],
          body: porCategoria.map(c => [c.nome, formatarMoeda(c.valor), `${c.percentual}%`]),
          styles: { fontSize: 10 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        });
      }

      if (dadosMesAtual.length > 0) {
        const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Transações do Mês', 14, finalY2);

        autoTable(doc, {
          startY: finalY2 + 5,
          head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']],
          body: [...dadosMesAtual]
            .sort((a, b) => a.data.localeCompare(b.data))
            .map(t => {
              const cat = categorias.find(c => c.id === t.categoria_id);
              return [
                parseFinancialDate(t.data).toLocaleDateString('pt-BR'),
                t.descricao,
                cat?.nome || 'Outros',
                t.tipo === 'receita' ? 'Receita' : 'Despesa',
                formatarMoeda(t.valor),
              ];
            }),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: { 4: { halign: 'right' } },
          didParseCell: (data) => {
            if (data.column.index === 3) {
              data.cell.styles.textColor =
                data.cell.raw === 'Receita' ? [16, 185, 129] : [239, 68, 68];
            }
          },
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `FinanceiroIA • Gerado em ${new Date().toLocaleDateString('pt-BR')} • Página ${i}/${pageCount}`,
          105, 290, { align: 'center' }
        );
      }

      doc.save(`financeiro-${nomeMes.toLowerCase()}-${anoSel}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecalho + tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">Relatórios</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-white/[0.06] bg-white/[0.02] p-0.5">
            <button
              onClick={() => setAbaAtiva('graficos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                abaAtiva === 'graficos'
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <TrendingUp size={13} />
              Gráficos
            </button>
            <button
              onClick={() => setAbaAtiva('relatorio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                abaAtiva === 'relatorio'
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Brain size={13} />
              Relatório IA
            </button>
          </div>

          {abaAtiva === 'graficos' && (
            <>
              <select
                value={anoSel}
                onChange={e => setAnoSel(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
              >
                {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button
                onClick={exportarPDF}
                disabled={exportando || dadosMesAtual.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Download size={14} />
                {exportando ? 'Gerando...' : 'PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Aba Graficos */}
      {abaAtiva === 'graficos' && (
        <>
          {/* Totais do ano */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <TrendingUp size={14} />
                <span className="text-xs">Receitas {anoSel}</span>
              </div>
              <div className="text-emerald-400 text-xl font-bold">{formatarMoeda(totalAno.receitas)}</div>
            </div>
            <div className="bg-red-950/30 border border-red-800/40 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <TrendingDown size={14} />
                <span className="text-xs">Despesas {anoSel}</span>
              </div>
              <div className="text-red-400 text-xl font-bold">{formatarMoeda(totalAno.despesas)}</div>
            </div>
          </div>

          {/* Grafico anual */}
          <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Evolução Mensal — {anoSel}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dadosAnuais}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="nome" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  formatter={(v, name) => [formatarMoeda(Number(v)), name === 'receitas' ? 'Receitas' : 'Despesas']}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                />
                <Line type="monotone" dataKey="receitas" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="despesas" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center text-xs">
              <span className="text-emerald-400">● Receitas</span>
              <span className="text-red-400">● Despesas</span>
            </div>
          </div>

          {/* Categorias do mes atual */}
          <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">
              Categorias — {MESES[mesAtualNum - 1]}/{anoSel}
            </h3>
            {porCategoria.length > 0 ? (
              <div className="space-y-3">
                {porCategoria.map((cat, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{cat.icone} {cat.nome}</span>
                      <div className="flex gap-3 items-center">
                        <span className="text-slate-500 text-xs">{cat.percentual}%</span>
                        <span className="text-red-400 font-medium">{formatarMoeda(cat.valor)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${cat.percentual}%`,
                          backgroundColor: CORES[i % CORES.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm text-center py-6">Sem dados para este mês</p>
            )}
          </div>

          {/* Analise de assinaturas */}
          {assinaturas.length > 0 && (
            <div className="bg-purple-950/30 border border-purple-800/40 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} className="text-purple-400" />
                <h3 className="text-sm font-semibold text-purple-300">Análise de Assinaturas</h3>
              </div>
              <p className="text-slate-400 text-sm mb-3">
                Você tem <strong className="text-white">{assinaturas.length} assinaturas</strong> totalizando{' '}
                <strong className="text-purple-400">
                  {formatarMoeda(assinaturas.reduce((s, t) => s + t.valor, 0))}/mês
                </strong>{' '}
                = <strong className="text-yellow-400">
                  {formatarMoeda(assinaturas.reduce((s, t) => s + t.valor, 0) * 12)}/ano
                </strong>
              </p>
              <div className="space-y-2">
                {assinaturas.map(t => (
                  <div key={t.id} className="flex justify-between items-center text-sm">
                    <span className="text-slate-300">{t.descricao}</span>
                    <span className="text-red-400">{formatarMoeda(t.valor)}</span>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-3">
                💡 Se cancelar a mais cara, economizaria{' '}
                <strong className="text-emerald-400">
                  {formatarMoeda((assinaturas[0]?.valor || 0) * 12)}/ano
                </strong>
              </p>
            </div>
          )}
        </>
      )}

      {/* Aba Relatorio IA */}
      {abaAtiva === 'relatorio' && <RelatorioIA />}
    </div>
  );
}

