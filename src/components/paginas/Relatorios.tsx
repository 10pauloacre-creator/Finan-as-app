'use client';

import { useMemo, useState } from 'react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { TrendingDown, TrendingUp, Lightbulb, Download } from 'lucide-react';

const CORES = ['#7C3AED','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#F97316'];
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function Relatorios() {
  const { transacoes, categorias } = useFinanceiroStore();
  const [anoSel, setAnoSel] = useState(new Date().getFullYear());
  const [exportando, setExportando] = useState(false);

  const dadosAnuais = useMemo(() => {
    return MESES.map((nome, i) => {
      const mes = i + 1;
      const doMes = transacoes.filter(t => {
        const d = new Date(t.data);
        return d.getMonth() + 1 === mes && d.getFullYear() === anoSel;
      });
      const receitas = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
      const despesas = doMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
      return { nome, receitas, despesas, saldo: receitas - despesas };
    });
  }, [transacoes, anoSel]);

  const mesAtualNum = new Date().getMonth() + 1;
  const dadosMesAtual = useMemo(() => {
    return transacoes.filter(t => {
      const d = new Date(t.data);
      return d.getMonth() + 1 === mesAtualNum && d.getFullYear() === anoSel;
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

  // Análise de assinaturas
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

      // Header
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

      // Resumo do mês
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

      // Categorias do mês
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

      // Transações do mês
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
                new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR'),
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

      // Footer
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Relatórios</h2>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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

      {/* Gráfico anual — evolução mensal */}
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

      {/* Categorias do mês atual */}
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

      {/* Análise de assinaturas */}
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
    </div>
  );
}
