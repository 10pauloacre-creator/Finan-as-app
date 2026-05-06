'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, CreditCard, Check, X, AlertCircle } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, BandeirCartao } from '@/types';
import BankLogo from '@/components/ui/BankLogo';
import BankSelector from '@/components/ui/BankSelector';
import CardBrandLogo from '@/components/ui/CardBrandLogo';

const BANDEIRAS: BandeirCartao[] = ['visa', 'mastercard', 'elo', 'amex', 'hipercard'];

export default function Cartoes() {
  const { cartoes, adicionarCartao, excluirCartao, atualizarFaturaCartao } = useFinanceiroStore();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novaFatura, setNovaFatura] = useState('');

  const [form, setForm] = useState({
    banco: 'nubank' as BancoSlug,
    nome: '',
    limite: '',
    fatura_atual: '',
    dia_vencimento: '15',
    dia_fechamento: '8',
    bandeira: 'mastercard' as BandeirCartao,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    adicionarCartao({
      banco: form.banco,
      nome: form.nome || `${BANCO_INFO[form.banco].nome} ${form.bandeira}`,
      limite: parseFloat(form.limite) || 0,
      fatura_atual: parseFloat(form.fatura_atual) || 0,
      dia_vencimento: parseInt(form.dia_vencimento) || 15,
      dia_fechamento: parseInt(form.dia_fechamento) || 8,
      bandeira: form.bandeira,
    });
    setForm({
      banco: 'nubank',
      nome: '',
      limite: '',
      fatura_atual: '',
      dia_vencimento: '15',
      dia_fechamento: '8',
      bandeira: 'mastercard',
    });
    setMostrarForm(false);
  }

  function salvarFatura(id: string) {
    const valor = parseFloat(novaFatura.replace(',', '.'));
    if (!isNaN(valor)) atualizarFaturaCartao(id, valor);
    setEditandoId(null);
    setNovaFatura('');
  }

  const totalFaturas = cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual, 0);
  const totalLimite = cartoes.reduce((soma, cartao) => soma + cartao.limite, 0);
  const totalDisponivel = totalLimite - totalFaturas;
  const hoje = new Date().getDate();

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cartões de Crédito</h2>
          <p className="text-slate-500 text-sm">
            Fatura total:{' '}
            <span className="text-red-400 font-semibold tabular-nums">{formatarMoeda(totalFaturas)}</span>
          </p>
        </div>
        <button
          onClick={() => setMostrarForm((valorAtual) => !valorAtual)}
          className="btn-primary flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-medium"
        >
          <Plus size={16} /> Novo Cartão
        </button>
      </div>

      <div className="glass-card p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Limite Total</div>
            <div className="text-lg font-bold text-white tabular-nums">{formatarMoeda(totalLimite)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Faturas</div>
            <div className="text-lg font-bold text-red-400 tabular-nums">{formatarMoeda(totalFaturas)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Disponível</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{formatarMoeda(totalDisponivel)}</div>
          </div>
        </div>

        {totalLimite > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Uso do limite</span>
              <span>{((totalFaturas / totalLimite) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min((totalFaturas / totalLimite) * 100, 100)}%`,
                  background:
                    totalFaturas / totalLimite > 0.8
                      ? '#EF4444'
                      : totalFaturas / totalLimite > 0.5
                        ? '#F59E0B'
                        : '#7C3AED',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4 border-purple-500/30">
          <h3 className="text-sm font-semibold text-purple-300">Novo Cartão</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Banco *</label>
              <BankSelector
                selected={form.banco}
                onChange={(banco) => setForm((anterior) => ({ ...anterior, banco }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bandeira</label>
              <select
                value={form.bandeira}
                onChange={(e) => setForm((anterior) => ({ ...anterior, bandeira: e.target.value as BandeirCartao }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              >
                {BANDEIRAS.map((bandeira) => (
                  <option key={bandeira} value={bandeira}>
                    {bandeira.charAt(0).toUpperCase() + bandeira.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nome do cartão (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Nubank Roxinho"
              value={form.nome}
              onChange={(e) => setForm((anterior) => ({ ...anterior, nome: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Limite (R$) *</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                required
                value={form.limite}
                onChange={(e) => setForm((anterior) => ({ ...anterior, limite: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fatura Atual (R$)</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                value={form.fatura_atual}
                onChange={(e) => setForm((anterior) => ({ ...anterior, fatura_atual: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do vencimento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_vencimento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_vencimento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do fechamento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_fechamento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_fechamento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {cartoes.map((cartao) => {
          const info = BANCO_INFO[cartao.banco];
          const percentual = cartao.limite > 0 ? (cartao.fatura_atual / cartao.limite) * 100 : 0;
          const disponivel = cartao.limite - cartao.fatura_atual;
          const diasVencimento =
            cartao.dia_vencimento >= hoje ? cartao.dia_vencimento - hoje : 30 - hoje + cartao.dia_vencimento;
          const emEdicao = editandoId === cartao.id;
          const urgente = diasVencimento <= 5 && cartao.fatura_atual > 0;

          return (
            <div key={cartao.id} className={`glass-card overflow-hidden ${urgente ? 'border-red-500/30' : ''}`}>
              <div
                className="p-5 relative"
                style={{ background: `linear-gradient(135deg, ${info.cor}15 0%, transparent 60%)` }}
              >
                {urgente && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mb-3 font-medium">
                    <AlertCircle size={13} />
                    Vencimento em {diasVencimento} dia{diasVencimento !== 1 ? 's' : ''}!
                  </div>
                )}

                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <BankLogo banco={cartao.banco} size={44} className="h-11 w-11 object-contain" />
                      <CardBrandLogo
                        banco={cartao.banco}
                        nomeCartao={cartao.nome}
                        bandeira={cartao.bandeira}
                        size={20}
                        className="absolute -bottom-1 -right-1 h-5 w-5 object-contain shadow-sm"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{cartao.nome}</div>
                      <div className="text-xs text-slate-500">
                        {info.nome} • {cartao.bandeira}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditandoId(cartao.id);
                        setNovaFatura(cartao.fatura_atual.toString());
                      }}
                      className="text-slate-500 hover:text-purple-400 p-1.5 rounded-lg hover:bg-purple-900/20 transition-colors"
                      aria-label="Editar fatura"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => confirm('Excluir este cartão?') && excluirCartao(cartao.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                      aria-label="Excluir cartão"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs text-slate-500 mb-1">Fatura Atual</div>
                  {emEdicao ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        value={novaFatura}
                        onChange={(e) => setNovaFatura(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && salvarFatura(cartao.id)}
                        className="w-36 bg-white/10 border border-white/20 text-white text-lg rounded-xl px-3 py-1.5 outline-none focus:border-purple-500 tabular-nums font-bold"
                      />
                      <button
                        onClick={() => salvarFatura(cartao.id)}
                        className="text-emerald-400 p-1.5 rounded-lg hover:bg-emerald-900/20"
                      >
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditandoId(null)} className="text-slate-500 p-1.5 rounded-lg hover:bg-white/10">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`text-2xl font-bold tabular-nums ${
                        percentual > 80 ? 'text-red-400' : percentual > 50 ? 'text-yellow-400' : 'text-white'
                      }`}
                    >
                      {formatarMoeda(cartao.fatura_atual)}
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(percentual, 100)}%`,
                        background: percentual > 80 ? '#EF4444' : percentual > 50 ? '#F59E0B' : info.cor,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>
                      Usado: <span className="text-slate-300 font-medium">{percentual.toFixed(1)}%</span>
                    </span>
                    <span>
                      Limite:{' '}
                      <span className="text-slate-300 font-medium tabular-nums">{formatarMoeda(cartao.limite)}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className="text-emerald-400 text-sm font-bold tabular-nums">{formatarMoeda(disponivel)}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">Disponível</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className={`text-sm font-bold ${diasVencimento <= 5 ? 'text-red-400' : 'text-slate-300'}`}>
                      {diasVencimento}d
                    </div>
                    <div className="text-slate-600 text-[11px] mt-0.5">p/ vencer</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className="text-slate-300 text-sm font-bold">Dia {cartao.dia_fechamento}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">fechamento</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {cartoes.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center py-14 text-slate-600">
            <CreditCard size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">Nenhum cartão cadastrado</p>
            <p className="text-xs mt-1">Clique em &quot;Novo Cartão&quot; para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}
