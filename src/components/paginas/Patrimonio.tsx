'use client';

import { useState, useMemo } from 'react';
import { Eye, EyeOff, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { BANCO_INFO, BancoSlug } from '@/types';

function bancoSigla(nome: string): string {
  return nome.slice(0, 2).toUpperCase();
}

// ─── Tipos locais ─────────────────────────────────────────────────────────────
type GrupoManual = 'imoveis' | 'veiculos' | 'outros';

interface ItemManual {
  id: string;
  nome: string;
  valor: number;
  grupo: GrupoManual;
  icone: string;
}

const GRUPO_INFO: Record<GrupoManual, { label: string; cor: string; icone: string }> = {
  imoveis:  { label: 'Imóveis',   cor: '#F59E0B', icone: '🏠' },
  veiculos: { label: 'Veículos',  cor: '#3B82F6', icone: '🚗' },
  outros:   { label: 'Outros',    cor: '#6B7280', icone: '📦' },
};

// ─── Modal adicionar / editar item manual ─────────────────────────────────────
interface ModalItemProps {
  item?: ItemManual;
  onSalvar: (item: Omit<ItemManual, 'id'>) => void;
  onFechar: () => void;
}

function ModalItemManual({ item, onSalvar, onFechar }: ModalItemProps) {
  const [nome, setNome]     = useState(item?.nome     || '');
  const [valor, setValor]   = useState(item?.valor?.toString() || '');
  const [grupo, setGrupo]   = useState<GrupoManual>(item?.grupo || 'outros');
  const [icone, setIcone]   = useState(item?.icone || GRUPO_INFO[item?.grupo || 'outros'].icone);

  const iconesSugeridos = ['🏠', '🏢', '🏗️', '🚗', '🏍️', '🚢', '✈️', '💎', '📦', '🌳', '🛻', '🏋️'];

  function handleSalvar() {
    const v = parseFloat(valor.replace(',', '.'));
    if (!nome.trim() || isNaN(v) || v <= 0) return;
    onSalvar({ nome: nome.trim(), valor: v, grupo, icone });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-5 border border-white/10"
        style={{ background: '#0E1220' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{item ? 'Editar ativo' : 'Novo ativo'}</h3>
          <button onClick={onFechar} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Ícone */}
        <div>
          <label className="text-xs text-slate-500 mb-2 block">Ícone</label>
          <div className="flex flex-wrap gap-2">
            {iconesSugeridos.map(ic => (
              <button key={ic} onClick={() => setIcone(ic)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  icone === ic ? 'ring-2 ring-purple-500 bg-purple-900/30' : 'bg-white/[0.05] hover:bg-white/10'
                }`}>{ic}</button>
            ))}
          </div>
        </div>

        {/* Nome */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Nome do ativo</label>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Apartamento, Honda Civic..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
          />
        </div>

        {/* Grupo */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Categoria</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(GRUPO_INFO) as [GrupoManual, typeof GRUPO_INFO[GrupoManual]][]).map(([g, info]) => (
              <button key={g} onClick={() => { setGrupo(g); setIcone(info.icone); }}
                className={`py-2 rounded-xl text-xs font-medium transition-all ${
                  grupo === g
                    ? 'text-white border-2'
                    : 'bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white'
                }`}
                style={grupo === g ? { background: `${info.cor}22`, borderColor: info.cor, color: info.cor } : {}}>
                {info.icone} {info.label}
              </button>
            ))}
          </div>
        </div>

        {/* Valor */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Valor (R$)</label>
          <input
            type="number"
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder="0,00"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
          />
        </div>

        <button
          onClick={handleSalvar}
          className="w-full btn-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Check size={16} /> {item ? 'Salvar alterações' : 'Adicionar ativo'}
        </button>
      </div>
    </div>
  );
}

// ─── Barra de progresso ───────────────────────────────────────────────────────
function BarraProgresso({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mt-2">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, background: cor }} />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Patrimonio() {
  const { contas, cartoes, investimentos } = useFinanceiroStore();
  const [oculto, setOculto]           = useState(false);
  const [itensManual, setItensManual] = useState<ItemManual[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditar, setItemEditar]   = useState<ItemManual | undefined>();

  const totais = useMemo(() => {
    const saldoContas     = contas.reduce((s, c) => s + c.saldo, 0);
    const faturaCartoes   = cartoes.reduce((s, c) => s + c.fatura_atual, 0);
    const totalInvest     = investimentos.reduce((s, i) => s + (i.valor_atual ?? i.valor_investido), 0);
    const totalManual     = itensManual.reduce((s, i) => s + i.valor, 0);
    const liquido         = saldoContas - faturaCartoes + totalInvest + totalManual;
    return { saldoContas, faturaCartoes, totalInvest, totalManual, liquido };
  }, [contas, cartoes, investimentos, itensManual]);

  const totalAtivos = totais.liquido + totais.faturaCartoes;

  const ocultarValor = (v: string) => oculto ? '••••••' : v;

  function handleSalvarManual(dados: Omit<ItemManual, 'id'>) {
    if (itemEditar) {
      setItensManual(prev => prev.map(i => i.id === itemEditar.id ? { ...dados, id: i.id } : i));
    } else {
      setItensManual(prev => [...prev, { ...dados, id: crypto.randomUUID() }]);
    }
    setModalAberto(false);
    setItemEditar(undefined);
  }

  function handleExcluir(id: string) {
    if (confirm('Remover este ativo?')) setItensManual(prev => prev.filter(i => i.id !== id));
  }

  function handleEditar(item: ItemManual) {
    setItemEditar(item);
    setModalAberto(true);
  }

  const qtdGrupos = [
    contas.length > 0,
    investimentos.length > 0,
    cartoes.length > 0,
    itensManual.length > 0,
  ].filter(Boolean).length;

  const qtdAtivos = contas.length + investimentos.length + cartoes.length + itensManual.length;

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mb-1">Patrimônio Líquido</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tabular-nums" style={{
              background: 'linear-gradient(135deg, #F1F5F9 0%, #A78BFA 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {oculto ? 'R$ ••••••' : formatarMoeda(totais.liquido)}
            </h1>
            <button onClick={() => setOculto(v => !v)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}>
              {oculto ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <p className="text-slate-500 text-sm mt-1">{qtdAtivos} ativos · {qtdGrupos} grupos</p>
        </div>
        <button
          onClick={() => { setItemEditar(undefined); setModalAberto(true); }}
          className="btn-primary flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      {/* ── Contas Bancárias ───────────────────────────────────────────── */}
      {contas.length > 0 && (
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🏦</span>
              <span className="text-sm font-semibold text-slate-200">Contas Bancárias</span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {ocultarValor(formatarMoeda(totais.saldoContas))}
            </span>
          </div>
          <div className="space-y-3">
            {contas.map(conta => {
              const info = BANCO_INFO[conta.banco] || BANCO_INFO.outro;
              const pct = totalAtivos > 0 ? (conta.saldo / totalAtivos) * 100 : 0;
              return (
                <div key={conta.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: info.cor, color: info.corTexto }}>
                      {bancoSigla(info.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{conta.nome}</span>
                        <span className="text-sm font-semibold text-white tabular-nums">{ocultarValor(formatarMoeda(conta.saldo))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{info.nome} · {conta.tipo}</span>
                        <span className="text-xs text-slate-600">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <BarraProgresso pct={pct} cor={info.cor} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Investimentos ──────────────────────────────────────────────── */}
      {investimentos.length > 0 && (
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">📈</span>
              <span className="text-sm font-semibold text-slate-200">Investimentos</span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {ocultarValor(formatarMoeda(totais.totalInvest))}
            </span>
          </div>
          <div className="space-y-3">
            {investimentos.map(inv => {
              const valorAtual = inv.valor_atual ?? inv.valor_investido;
              const pct = totalAtivos > 0 ? (valorAtual / totalAtivos) * 100 : 0;
              const rent = inv.valor_investido > 0
                ? ((valorAtual - inv.valor_investido) / inv.valor_investido) * 100
                : 0;
              const tipoIcone = inv.tipo === 'acoes' ? '📊'
                : inv.tipo === 'cripto' ? '₿'
                : inv.tipo === 'fundos_di' ? '🏛️'
                : inv.tipo === 'tesouro_selic' || inv.tipo === 'tesouro_ipca' || inv.tipo === 'tesouro_prefixado' ? '🏦'
                : '💰';
              return (
                <div key={inv.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center text-sm">
                      {tipoIcone}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{inv.nome}</span>
                        <span className="text-sm font-semibold text-white tabular-nums">{ocultarValor(formatarMoeda(valorAtual))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{inv.tipo.replace(/_/g, ' ')}</span>
                        <span className={`text-xs font-medium ${rent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {rent >= 0 ? '+' : ''}{rent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <BarraProgresso pct={pct} cor="#10B981" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Cartões (passivo) ─────────────────────────────────────────── */}
      {cartoes.length > 0 && (
        <section className="glass-card p-5" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">💳</span>
              <span className="text-sm font-semibold text-slate-200">Cartões (débito)</span>
            </div>
            <span className="text-sm font-bold text-red-400 tabular-nums">
              -{ocultarValor(formatarMoeda(totais.faturaCartoes))}
            </span>
          </div>
          <div className="space-y-3">
            {cartoes.map(cartao => {
              const info = BANCO_INFO[cartao.banco] || BANCO_INFO.outro;
              const pct = totais.faturaCartoes > 0 ? (cartao.fatura_atual / totais.faturaCartoes) * 100 : 0;
              return (
                <div key={cartao.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: info.cor, color: info.corTexto }}>
                      {bancoSigla(info.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{cartao.nome}</span>
                        <span className="text-sm font-semibold text-red-400 tabular-nums">-{ocultarValor(formatarMoeda(cartao.fatura_atual))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{info.nome} · {cartao.bandeira}</span>
                        <span className="text-xs text-slate-600">{pct.toFixed(1)}% do débito</span>
                      </div>
                    </div>
                  </div>
                  <BarraProgresso pct={pct} cor="#EF4444" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Outros (manuais) ──────────────────────────────────────────── */}
      {(itensManual.length > 0 || true) && (
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🏠</span>
              <span className="text-sm font-semibold text-slate-200">Outros ativos</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{ color: '#A78BFA' }}>
              {ocultarValor(formatarMoeda(totais.totalManual))}
            </span>
          </div>

          {itensManual.length === 0 ? (
            <div className="text-center py-6 text-slate-600">
              <div className="text-3xl mb-2 opacity-40">🏠</div>
              <p className="text-sm text-slate-600">Nenhum ativo manual</p>
              <p className="text-xs mt-1 text-slate-700">Adicione imóveis, veículos, etc.</p>
              <button
                onClick={() => { setItemEditar(undefined); setModalAberto(true); }}
                className="mt-3 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 mx-auto"
              >
                <Plus size={12} /> Adicionar ativo
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {itensManual.map(item => {
                const grupoInfo = GRUPO_INFO[item.grupo];
                const pct = totalAtivos > 0 ? (item.valor / totalAtivos) * 100 : 0;
                return (
                  <div key={item.id}>
                    <div className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: `${grupoInfo.cor}22` }}>
                        {item.icone}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white truncate">{item.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white tabular-nums">{ocultarValor(formatarMoeda(item.valor))}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditar(item)} className="p-1 text-slate-500 hover:text-purple-400 rounded">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleExcluir(item.id)} className="p-1 text-slate-500 hover:text-red-400 rounded">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: grupoInfo.cor }}>{grupoInfo.icone} {grupoInfo.label}</span>
                          <span className="text-xs text-slate-600">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    <BarraProgresso pct={pct} cor={grupoInfo.cor} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Resumo total ─────────────────────────────────────────────── */}
      <section className="glass-card p-5" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Resumo</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">🏦 Contas bancárias</span>
            <span className="text-emerald-400 tabular-nums">{ocultarValor(formatarMoeda(totais.saldoContas))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">📈 Investimentos</span>
            <span className="text-emerald-400 tabular-nums">{ocultarValor(formatarMoeda(totais.totalInvest))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">💳 Faturas em aberto</span>
            <span className="text-red-400 tabular-nums">-{ocultarValor(formatarMoeda(totais.faturaCartoes))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">🏠 Outros ativos</span>
            <span className="text-purple-400 tabular-nums">{ocultarValor(formatarMoeda(totais.totalManual))}</span>
          </div>
          <div className="h-px bg-white/[0.06] my-2" />
          <div className="flex justify-between">
            <span className="text-sm font-bold text-white">Total líquido</span>
            <span className={`text-base font-bold tabular-nums ${totais.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ocultarValor(formatarMoeda(totais.liquido))}
            </span>
          </div>
        </div>
      </section>

      {/* Modal */}
      {modalAberto && (
        <ModalItemManual
          item={itemEditar}
          onSalvar={handleSalvarManual}
          onFechar={() => { setModalAberto(false); setItemEditar(undefined); }}
        />
      )}
    </div>
  );
}
