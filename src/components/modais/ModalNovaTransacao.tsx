'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, Brain, Loader2, CheckCircle } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { MetodoPagamento, TipoTransacao, Transacao, BANCO_INFO } from '@/types';
import { detectarDuplicata } from '@/lib/duplicata';
import ModalDuplicata from './ModalDuplicata';
import { formatFinancialDate } from '@/lib/date';
import BankLogo from '@/components/ui/BankLogo';
import OCRModelSelect from '@/components/ui/OCRModelSelect';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  transacaoEditar?: Transacao;
  tipoInicial?: TipoTransacao;
}

const METODOS: { valor: MetodoPagamento; label: string; icone: string }[] = [
  { valor: 'pix', label: 'Pix', icone: '⚡' },
  { valor: 'debito', label: 'Débito', icone: '💳' },
  { valor: 'credito', label: 'Crédito', icone: '💳' },
  { valor: 'dinheiro', label: 'Dinheiro', icone: '💵' },
  { valor: 'transferencia', label: 'TED/DOC', icone: '🏦' },
  { valor: 'outro', label: 'Outro', icone: '📋' },
];

function getFormVazio(tipo: TipoTransacao = 'despesa') {
  return {
    descricao: '',
    valor: '',
    tipo,
    categoria_id: '',
    data: formatFinancialDate(new Date()),
    horario: '',
    metodo_pagamento: 'pix' as MetodoPagamento,
    parcelas: '1',
    local: '',
    observacoes: '',
    conta_id: '',
    cartao_id: '',
  };
}

export default function ModalNovaTransacao({ aberto, onFechar, transacaoEditar, tipoInicial = 'despesa' }: Props) {
  const { categorias, contas, cartoes, transacoes, adicionarTransacao, editarTransacao, config, atualizarConfig } = useFinanceiroStore();
  const [form, setForm] = useState(() => getFormVazio(tipoInicial));
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroIA, setErroIA] = useState('');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [duplicataEncontrada, setDuplicataEncontrada] = useState<Transacao | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preenche form ao editar
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (transacaoEditar) {
        setForm({
          descricao: transacaoEditar.descricao,
          valor: transacaoEditar.valor.toString(),
          tipo: transacaoEditar.tipo,
          categoria_id: transacaoEditar.categoria_id,
          data: transacaoEditar.data,
          horario: transacaoEditar.horario || '',
          metodo_pagamento: transacaoEditar.metodo_pagamento || 'pix',
          parcelas: transacaoEditar.parcelas?.toString() || '1',
          local: transacaoEditar.local || '',
          observacoes: transacaoEditar.observacoes || '',
          conta_id: transacaoEditar.conta_id || '',
          cartao_id: transacaoEditar.cartao_id || '',
        });
      } else {
        setForm(getFormVazio(tipoInicial));
        setFotoPreview(null);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [transacaoEditar, aberto, tipoInicial]);

  // Categorias filtradas pelo tipo
  const categoriasFiltradas = categorias.filter(c => c.tipo === form.tipo || c.tipo === 'transferencia');

  const mostrarContaSelector = ['pix', 'debito', 'transferencia'].includes(form.metodo_pagamento);
  const mostrarCartaoSelector = form.metodo_pagamento === 'credito';

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => setFotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setAnalisandoIA(true);
    setErroIA('');

    try {
      const fd = new FormData();
      fd.append('task', 'analisar_recibo_futuramente');
      fd.append('foto', file);
      fd.append('provider', config.ai_modelo_ocr_padrao || 'automatico');
      fd.append('mode', (config.ai_modelo_ocr_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto');
      fd.append('financialProvider', config.ai_modelo_padrao || 'automatico');

      const res = await fetch('/api/ai', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.dados) {
        setForm(f => ({
          ...f,
          descricao: data.dados.descricao || f.descricao,
          valor: data.dados.valor?.toString() || f.valor,
          categoria_id: data.dados.categoria_id || f.categoria_id,
          data: data.dados.data || f.data,
          horario: data.dados.horario || f.horario,
          metodo_pagamento: data.dados.metodo_pagamento || f.metodo_pagamento,
          parcelas: data.dados.parcelas?.toString() || f.parcelas,
          local: data.dados.local || f.local,
        }));
      }
    } catch {
      setErroIA('Não foi possível analisar a imagem. Preencha manualmente.');
    } finally {
      setAnalisandoIA(false);
    }
  }

  function salvarTransacao() {
    const dados = {
      descricao: form.descricao,
      valor: parseFloat(form.valor.replace(',', '.')),
      tipo: form.tipo,
      categoria_id: form.categoria_id,
      data: form.data,
      horario: form.horario || undefined,
      metodo_pagamento: form.metodo_pagamento,
      parcelas: parseInt(form.parcelas) || 1,
      local: form.local || undefined,
      observacoes: form.observacoes || undefined,
      origem: 'manual' as const,
      conta_id: form.conta_id || undefined,
      cartao_id: form.cartao_id || undefined,
    };

    if (transacaoEditar) {
      editarTransacao(transacaoEditar.id, dados);
    } else {
      adicionarTransacao(dados);
    }

    setSucesso(true);
    setTimeout(() => {
      setSucesso(false);
      onFechar();
    }, 800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao || !form.valor || !form.categoria_id) return;

    // Only check for duplicates on new transactions
    if (!transacaoEditar) {
      const duplicata = detectarDuplicata(
        {
          valor: parseFloat(form.valor.replace(',', '.')),
          categoria_id: form.categoria_id,
          data: form.data,
        },
        transacoes,
      );

      if (duplicata) {
        setDuplicataEncontrada(duplicata);
        return;
      }
    }

    salvarTransacao();
  }

  if (!aberto) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />

        {/* Modal */}
        <div className="relative bg-slate-900 border border-slate-700 rounded-t-3xl lg:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto z-10">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
            <h2 className="text-lg font-bold text-white">
              {transacaoEditar ? 'Editar Transação' : 'Nova Transação'}
            </h2>
            <button onClick={onFechar} className="text-slate-400 hover:text-white p-1 rounded-lg">
              <X size={20} />
            </button>
          </div>

          {/* Sucesso */}
          {sucesso && (
            <div className="flex items-center justify-center gap-2 p-4 bg-emerald-900/30 text-emerald-400">
              <CheckCircle size={18} />
              <span className="text-sm font-medium">Transação salva!</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Tipo de transação */}
            <div className="flex bg-slate-800 rounded-xl p-1">
              {(['despesa', 'receita', 'transferencia'] as TipoTransacao[]).map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo, categoria_id: '' }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                    form.tipo === tipo
                      ? tipo === 'despesa'
                        ? 'bg-red-600 text-white'
                        : tipo === 'receita'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tipo === 'despesa' ? '💸 Despesa' : tipo === 'receita' ? '💰 Receita' : '↔️ Transfer.'}
                </button>
              ))}
            </div>

            {/* Upload de foto para IA analisar */}
            {!transacaoEditar && (
              <div>
                <div className="mb-3">
                  <p className="text-[11px] text-slate-500 mb-2">Leitor OCR</p>
                  <OCRModelSelect
                    value={config.ai_modelo_ocr_padrao || 'automatico'}
                    onChange={(value) => atualizarConfig({ ai_modelo_ocr_padrao: value })}
                  />
                </div>
                <input
                  type="file"
                  ref={fileRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleFoto}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={analisandoIA}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-purple-700 text-purple-400 hover:bg-purple-900/20 rounded-xl py-3 text-sm font-medium transition-all"
                >
                  {analisandoIA ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <Brain size={16} />
                      IA analisando o comprovante...
                    </>
                  ) : (
                    <>
                      <Camera size={16} />
                      📸 Fotografar comprovante (IA preenche sozinha)
                    </>
                  )}
                </button>
                {erroIA && <p className="text-red-400 text-xs mt-1">{erroIA}</p>}
                {fotoPreview && !analisandoIA && (
                  <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle size={12} />
                    Foto carregada — confira os campos abaixo
                  </div>
                )}
              </div>
            )}

            {/* Descrição */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Descrição *</label>
              <input
                type="text"
                placeholder="Ex: Mercadinho, Uber, iFood..."
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
                required
              />
            </div>

            {/* Valor e data */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Valor (R$) *</label>
                <input
                  type="number"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
                  required
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Data</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Categoria */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoria *</label>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                {categoriasFiltradas.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, categoria_id: cat.id }))}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs transition-all ${
                      form.categoria_id === cat.id
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <span className="text-lg">{cat.icone}</span>
                    <span className="truncate w-full text-center text-[10px]">{cat.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Método de pagamento */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Forma de Pagamento</label>
              <div className="flex flex-wrap gap-2">
                {METODOS.map(m => (
                  <button
                    key={m.valor}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, metodo_pagamento: m.valor, conta_id: '', cartao_id: '' }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      form.metodo_pagamento === m.valor
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.icone} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conta de origem (PIX, débito, transferência) */}
            {mostrarContaSelector && contas.length > 0 && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Conta de origem</label>
                <div className="flex flex-wrap gap-2">
                  {contas.map(conta => {
                    const info = BANCO_INFO[conta.banco];
                    const ativo = form.conta_id === conta.id;
                    return (
                      <button
                        key={conta.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, conta_id: ativo ? '' : conta.id }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          ativo
                            ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                            : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                        }`}
                      >
                        <BankLogo banco={conta.banco} size={20} className="h-5 w-5 object-contain" />
                        {info.nome} · {conta.tipo}
                      </button>
                    );
                  })}
                </div>
                {!form.conta_id && (
                  <p className="text-[11px] text-slate-600 mt-1">Não informado</p>
                )}
              </div>
            )}

            {/* Cartão de crédito */}
            {mostrarCartaoSelector && cartoes.length > 0 && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Cartão de crédito</label>
                <div className="flex flex-wrap gap-2">
                  {cartoes.map(cartao => {
                    const info = BANCO_INFO[cartao.banco];
                    const ativo = form.cartao_id === cartao.id;
                    const ultimos4 = cartao.nome.slice(-4);
                    return (
                      <button
                        key={cartao.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, cartao_id: ativo ? '' : cartao.id }))}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                          ativo
                            ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                            : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                        }`}
                      >
                        <BankLogo banco={cartao.banco} size={20} className="h-5 w-5 object-contain mt-0.5" />
                        <span className="flex flex-col items-start">
                          <span>{info.nome} ···{ultimos4}</span>
                          <span className={`text-[10px] mt-0.5 ${ativo ? 'text-purple-400/70' : 'text-slate-600'}`}>
                            Fatura: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartao.fatura_atual)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!form.cartao_id && (
                  <p className="text-[11px] text-slate-600 mt-1">Não informado</p>
                )}
              </div>
            )}

            {/* Parcelas (só para crédito) */}
            {form.metodo_pagamento === 'credito' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Nº de Parcelas</label>
                  <select
                    value={form.parcelas}
                    onChange={e => setForm(f => ({ ...f, parcelas: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
                {parseInt(form.parcelas) > 1 && form.valor && (
                  <div className="flex items-end pb-2.5">
                    <div>
                      <div className="text-xs text-slate-500">Por parcela</div>
                      <div className="text-purple-400 font-semibold text-sm">
                        {formatarMoeda(parseFloat(form.valor) / parseInt(form.parcelas))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Local (opcional) */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Local (opcional)</label>
              <input
                type="text"
                placeholder="Ex: Mercadinho do João, Rio Branco-AC"
                value={form.local}
                onChange={e => setForm(f => ({ ...f, local: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>

            {/* Botão salvar */}
            <button
              type="submit"
              disabled={sucesso || !form.descricao || !form.valor || !form.categoria_id}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:text-purple-700 text-white py-3 rounded-xl font-semibold transition-all active:scale-95"
            >
              {sucesso ? '✅ Salvo!' : transacaoEditar ? 'Salvar Alterações' : 'Lançar Transação'}
            </button>
          </form>
        </div>
      </div>

      {/* Modal de duplicata */}
      {duplicataEncontrada && (
        <ModalDuplicata
          transacaoExistente={duplicataEncontrada}
          onConfirmar={() => {
            setDuplicataEncontrada(null);
            salvarTransacao();
          }}
          onCancelar={() => setDuplicataEncontrada(null)}
        />
      )}
    </>
  );
}

