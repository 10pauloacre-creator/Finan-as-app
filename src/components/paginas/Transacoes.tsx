'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Trash2, Edit, Plus, MessageCircle, Download, RefreshCw } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { Transacao } from '@/types';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { BotTransacao } from '@/lib/data-store';

const FILTROS_TIPO = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'despesa', label: 'Despesas' },
  { valor: 'receita', label: 'Receitas' },
];

export default function Transacoes() {
  const { transacoes, categorias, excluirTransacao, adicionarTransacao } = useFinanceiroStore();
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear());
  const [modalAberto, setModalAberto] = useState(false);
  const [transacaoEditar, setTransacaoEditar] = useState<Transacao | undefined>();
  const [botPendentes, setBotPendentes] = useState(0);
  const [importando, setImportando]     = useState(false);

  const verificarFila = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/fila');
      if (res.ok) {
        const data = await res.json() as { total: number };
        setBotPendentes(data.total);
      }
    } catch { /* sem conexão */ }
  }, []);

  useEffect(() => {
    verificarFila();
    const interval = setInterval(verificarFila, 30_000);
    return () => clearInterval(interval);
  }, [verificarFila]);

  async function importarDoBot() {
    setImportando(true);
    try {
      const res = await fetch('/api/bot/fila');
      if (!res.ok) return;
      const { transacoes: botTxs } = await res.json() as { transacoes: BotTransacao[] };
      if (!botTxs.length) { alert('Nenhuma transação pendente do bot.'); return; }

      const catPadrao = categorias[0]?.id || '';
      const ids: string[] = [];

      for (const bt of botTxs) {
        const catMatch = categorias.find(c =>
          c.nome.toLowerCase().includes(bt.categoria.toLowerCase())
        );
        adicionarTransacao({
          tipo: bt.tipo,
          valor: bt.valor,
          descricao: bt.descricao,
          data: bt.data,
          categoria_id: catMatch?.id || catPadrao,
          metodo_pagamento: bt.metodo_pagamento === 'nao_informado' ? 'pix' : bt.metodo_pagamento as 'pix' | 'credito' | 'debito' | 'dinheiro',
          origem: 'whatsapp_texto',
        });
        ids.push(bt.id);
      }

      await fetch('/api/bot/fila', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      setBotPendentes(0);
      alert(`✅ ${botTxs.length} transação(ões) importada(s) com sucesso!`);
    } finally {
      setImportando(false);
    }
  }

  const transacoesFiltradas = useMemo(() => {
    return transacoes.filter(t => {
      const d = new Date(t.data);
      const mesOk = d.getMonth() + 1 === filtroMes && d.getFullYear() === filtroAno;
      const tipoOk = filtroTipo === 'todos' || t.tipo === filtroTipo;
      const buscaOk = !busca || t.descricao.toLowerCase().includes(busca.toLowerCase());
      return mesOk && tipoOk && buscaOk;
    });
  }, [transacoes, filtroMes, filtroAno, filtroTipo, busca]);

  const totais = useMemo(() => ({
    receitas: transacoesFiltradas.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0),
    despesas: transacoesFiltradas.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0),
  }), [transacoesFiltradas]);

  const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  function handleEditar(t: Transacao) {
    setTransacaoEditar(t);
    setModalAberto(true);
  }

  function handleExcluir(id: string) {
    if (confirm('Excluir esta transação?')) {
      excluirTransacao(id);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Transações</h2>
        <div className="flex gap-2">
          {/* Botão importar do bot */}
          <button
            onClick={importarDoBot}
            disabled={importando}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-50"
            title="Importar lançamentos do WhatsApp Bot"
          >
            {importando ? <RefreshCw size={15} className="animate-spin" /> : <MessageCircle size={15} />}
            <span className="hidden sm:inline">Bot</span>
            {botPendentes > 0 && !importando && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-purple-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {botPendentes > 9 ? '9+' : botPendentes}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTransacaoEditar(undefined); setModalAberto(true); }}
            className="btn-primary flex items-center gap-1.5 text-white px-3 py-2 rounded-xl text-sm font-medium"
          >
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      {/* Filtros de mês/ano */}
      <div className="flex gap-2 items-center">
        <select
          value={filtroMes}
          onChange={e => setFiltroMes(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
        >
          {nomesMeses.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={filtroAno}
          onChange={e => setFiltroAno(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
        >
          {[2024, 2025, 2026, 2027].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Cards totais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-4">
          <div className="text-emerald-400 text-xs mb-1">Receitas</div>
          <div className="text-emerald-400 text-xl font-bold">{formatarMoeda(totais.receitas)}</div>
        </div>
        <div className="bg-red-950/30 border border-red-800/40 rounded-2xl p-4">
          <div className="text-red-400 text-xs mb-1">Despesas</div>
          <div className="text-red-400 text-xl font-bold">{formatarMoeda(totais.despesas)}</div>
        </div>
      </div>

      {/* Busca e filtro tipo */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex gap-2">
          {FILTROS_TIPO.map(f => (
            <button
              key={f.valor}
              onClick={() => setFiltroTipo(f.valor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroTipo === f.valor
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de transações */}
      <div className="space-y-2">
        {transacoesFiltradas.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm">Nenhuma transação encontrada</p>
          </div>
        ) : (
          transacoesFiltradas.map(t => {
            const cat = categorias.find(c => c.id === t.categoria_id);
            return (
              <div key={t.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-3 border border-slate-700/50 group">
                <div className="text-xl w-10 h-10 flex items-center justify-center bg-slate-700 rounded-xl flex-shrink-0">
                  {cat?.icone || '💳'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                  <div className="text-xs text-slate-500">
                    {cat?.nome || 'Outros'}
                    {t.metodo_pagamento && ` • ${t.metodo_pagamento.toUpperCase()}`}
                    {t.parcelas && t.parcelas > 1 && ` • ${t.parcela_atual || 1}/${t.parcelas}x`}
                    {' • '}
                    {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  {t.local && <div className="text-xs text-slate-600 truncate">📍 {t.local}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-semibold ${
                    t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditar(t)}
                      className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-900/30 rounded-lg"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleExcluir(t.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ModalNovaTransacao
        aberto={modalAberto}
        onFechar={() => { setModalAberto(false); setTransacaoEditar(undefined); }}
        transacaoEditar={transacaoEditar}
      />
    </div>
  );
}
