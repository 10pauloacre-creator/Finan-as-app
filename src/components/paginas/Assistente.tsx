'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, MicOff, ImageIcon, Camera, Send, Bot, CheckCircle2, XCircle,
  Loader2, Sparkles, Volume2, AlertCircle, FileText, CreditCard,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { construirContexto } from '@/lib/contexto-financeiro';
import type { TransacaoExtraida } from '@/lib/assistente-types';
import type { RespostaPDF } from '@/app/api/assistente/pdf/route';
import type { MetodoPagamento, OrigemTransacao, ContaBancaria, CartaoCredito, Transacao } from '@/types';
import { BANCO_INFO } from '@/types';
import { detectarDuplicata } from '@/lib/duplicata';
import ModalDuplicata from '@/components/modais/ModalDuplicata';

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

type MsgPapel = 'user' | 'assistente';

interface Mensagem {
  id: string;
  papel: MsgPapel;
  texto: string;
  imagemPreview?: string;
  pdfNome?: string;
  pdfInfo?: string;
  eAudio?: boolean;
  transcricao?: string;
  transacao?: TransacaoExtraida;
  transacoes?: TransacaoExtraida[];
  confirmadas?: Set<number>;
  status?: 'confirmada' | 'cancelada';
  carregando?: boolean;
  ts: number;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const CATEGORIA_MAP: Record<string, string> = {
  'alimentação': 'alimentacao', 'alimentacao': 'alimentacao',
  'mercado': 'mercado',
  'transporte': 'transporte',
  'saúde': 'saude',         'saude': 'saude',
  'educação': 'educacao',   'educacao': 'educacao',
  'lazer': 'lazer',
  'roupas': 'roupas',
  'moradia': 'moradia',
  'assinaturas': 'assinaturas',
  'contas': 'conta_agua_luz',
  'pet': 'pet',
  'beleza': 'beleza',
  'presentes': 'presente',
  'farmácia': 'farmacia',   'farmacia': 'farmacia',
  'delivery': 'delivery',
  'salário': 'salario',     'salario': 'salario',
  'freelance': 'freelance',
  'rendimentos': 'investimento_rend',
};

function mapCategoria(nome: string, tipo: 'despesa' | 'receita'): string {
  const key = nome.toLowerCase().trim();
  return CATEGORIA_MAP[key] ?? (tipo === 'receita' ? 'outros_receita' : 'outros_despesa');
}

function mapMetodo(m: string): MetodoPagamento {
  if (m === 'pix')      return 'pix';
  if (m === 'credito')  return 'credito';
  if (m === 'debito')   return 'debito';
  if (m === 'dinheiro') return 'dinheiro';
  return 'pix';
}

function formatBRL(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatData(data: string) {
  const [y, m, d] = data.split('-');
  return `${d}/${m}/${y}`;
}

function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Boas-vindas ────────────────────────────────────────────────────────────── */

const MSG_BOAS_VINDAS: Mensagem = {
  id: 'boas-vindas',
  papel: 'assistente',
  texto: 'Olá! Sou o **Assistente IA** do FinanceiroIA 👋\n\nPode me contar sobre seus gastos por:\n• ✍️ **Texto** — "Gastei R$ 45 no iFood hoje"\n• 🎤 **Áudio** — segure o microfone e fale\n• 🖼️ **Imagem** — foto de comprovante ou nota fiscal\n• 📄 **PDF** — fatura do cartão de crédito (lança todos os gastos de uma vez!)\n\nVou extrair as informações e você confirma para salvar!',
  ts: Date.now(),
};

/* ── Componente TransacaoCard ───────────────────────────────────────────────── */

interface CardProps {
  tx: TransacaoExtraida;
  status?: 'confirmada' | 'cancelada';
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  onConfirmar: (contaId?: string, cartaoId?: string) => void;
  onCancelar: () => void;
}

function TransacaoCard({ tx, status, contas, cartoes, onConfirmar, onCancelar }: CardProps) {
  const isDespesa = tx.tipo === 'despesa';
  const confirmed = status === 'confirmada';
  const cancelled = status === 'cancelada';

  const [contaId, setContaId] = useState('');
  const [cartaoId, setCartaoId] = useState('');

  const mostrarContas = !confirmed && !cancelled &&
    (tx.metodo_pagamento === 'pix' || tx.metodo_pagamento === 'debito' ||
     tx.metodo_pagamento === 'nao_informado' || !tx.metodo_pagamento);
  const mostrarCartoes = !confirmed && !cancelled && tx.metodo_pagamento === 'credito';

  return (
    <div className={`mt-3 rounded-xl border overflow-hidden transition-all
      ${confirmed ? 'border-emerald-500/40 bg-emerald-500/5' :
        cancelled ? 'border-white/5 bg-white/[0.02] opacity-50' :
        isDespesa  ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}
    `}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b
        ${confirmed ? 'border-emerald-500/20 bg-emerald-500/10' :
          cancelled ? 'border-white/5' :
          isDespesa  ? 'border-red-500/20 bg-red-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}
      `}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{isDespesa ? '🔴' : '🟢'}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {isDespesa ? 'Despesa' : 'Receita'}
          </span>
        </div>
        {confirmed && <span className="text-xs text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Salvo</span>}
        {cancelled && <span className="text-xs text-slate-500 font-medium flex items-center gap-1"><XCircle size={12} /> Cancelado</span>}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-white font-semibold text-sm leading-tight flex-1">{tx.descricao}</p>
          <p className={`text-base font-bold whitespace-nowrap
            ${isDespesa ? 'text-red-400' : 'text-emerald-400'}
          `}>
            {formatBRL(tx.valor)}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>📂 {tx.categoria}</span>
          <span>📅 {formatData(tx.data)}</span>
          {tx.hora && <span>🕐 {tx.hora}</span>}
          {tx.metodo_pagamento !== 'nao_informado' && (
            <span>💳 {tx.metodo_pagamento.charAt(0).toUpperCase() + tx.metodo_pagamento.slice(1)}</span>
          )}
          {tx.local && <span>📍 {tx.local}</span>}
          {tx.banco && <span>🏦 {tx.banco}</span>}
        </div>
      </div>

      {/* Seletor de conta bancária */}
      {mostrarContas && contas.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <p className="text-[11px] text-slate-500">Conta de origem (opcional)</p>
          <div className="flex flex-wrap gap-1.5">
            {contas.map(conta => {
              const info = BANCO_INFO[conta.banco];
              const ativo = contaId === conta.id;
              return (
                <button
                  key={conta.id}
                  type="button"
                  onClick={() => setContaId(ativo ? '' : conta.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                    ativo
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                      : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {info.nome}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Seletor de cartão de crédito */}
      {mostrarCartoes && cartoes.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <p className="text-[11px] text-slate-500">Cartão de crédito (opcional)</p>
          <div className="flex flex-wrap gap-1.5">
            {cartoes.map(cartao => {
              const info = BANCO_INFO[cartao.banco];
              const ativo = cartaoId === cartao.id;
              return (
                <button
                  key={cartao.id}
                  type="button"
                  onClick={() => setCartaoId(ativo ? '' : cartao.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                    ativo
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                      : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {info.nome}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ações */}
      {!confirmed && !cancelled && (
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => onConfirmar(contaId || undefined, cartaoId || undefined)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors"
          >
            <CheckCircle2 size={14} />
            Confirmar
          </button>
          <button
            onClick={onCancelar}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 text-xs font-semibold transition-colors"
          >
            <XCircle size={14} />
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Componente Bubble ──────────────────────────────────────────────────────── */

interface BubbleProps {
  msg: Mensagem;
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  onConfirmar:     (msgId: string, contaId?: string, cartaoId?: string) => void;
  onCancelar:      (msgId: string) => void;
  onConfirmarLote: (msgId: string, idx: number, contaId?: string, cartaoId?: string) => void;
}

function Bubble({ msg, contas, cartoes, onConfirmar, onCancelar, onConfirmarLote }: BubbleProps) {
  const isUser = msg.papel === 'user';

  function renderTexto(texto: string) {
    return texto.split('\n').map((linha, i) => {
      const parts = linha.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return (
        <span key={i}>
          {parts.map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**'))
              return <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>;
            if (p.startsWith('*') && p.endsWith('*'))
              return <em key={j} className="italic text-slate-300">{p.slice(1, -1)}</em>;
            return <span key={j}>{p}</span>;
          })}
          {i < texto.split('\n').length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-2`}>
      {/* Avatar IA */}
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/30 flex items-center justify-center shrink-0 mb-0.5">
          <Bot size={14} className="text-purple-400" />
        </div>
      )}

      <div className={`max-w-[85%] min-w-0 ${isUser ? '' : 'flex-1'}`}>

        {/* Preview de imagem */}
        {msg.imagemPreview && (
          <div className={`mb-2 ${isUser ? 'flex justify-end' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.imagemPreview}
              alt="Imagem enviada"
              className="max-w-[200px] max-h-[160px] rounded-xl object-cover border border-white/10"
            />
          </div>
        )}

        {/* Preview de PDF */}
        {msg.pdfNome && (
          <div className={`mb-2 ${isUser ? 'flex justify-end' : ''}`}>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 max-w-[240px]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <FileText size={15} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-300 truncate">{msg.pdfNome}</p>
                {msg.pdfInfo && <p className="text-[10px] text-slate-500 mt-0.5">{msg.pdfInfo}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Bolha de texto */}
        {(msg.texto || msg.carregando) && (
          <div className={`
            px-4 py-3 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-purple-600/80 text-white rounded-br-md'
              : 'bg-[#0F1629] border border-white/[0.07] text-slate-300 rounded-bl-md'
            }
            ${msg.carregando ? 'flex items-center gap-2' : ''}
          `}>
            {msg.carregando
              ? <>
                  <Loader2 size={14} className="animate-spin text-purple-400" />
                  <span className="text-slate-400">
                    {msg.pdfNome ? 'Analisando fatura com IA...' : 'Processando...'}
                  </span>
                </>
              : renderTexto(msg.texto)
            }
          </div>
        )}

        {/* Badge: áudio transcrito */}
        {msg.eAudio && msg.transcricao && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Volume2 size={11} />
            <span className="italic">{msg.transcricao}</span>
          </div>
        )}

        {/* Card de transação única */}
        {msg.transacao && (
          <TransacaoCard
            tx={msg.transacao}
            status={msg.status}
            contas={contas}
            cartoes={cartoes}
            onConfirmar={(cId, caId) => onConfirmar(msg.id, cId, caId)}
            onCancelar={() => onCancelar(msg.id)}
          />
        )}

        {/* Cards de lote (extrato / fatura PDF) */}
        {msg.transacoes && msg.transacoes.length > 0 && (
          <div className="mt-2">
            {(() => {
              const total     = msg.transacoes!.length;
              const confirmed = msg.confirmadas?.size ?? 0;
              const allDone   = confirmed === total;
              return (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[11px] text-slate-500">
                    {confirmed}/{total} confirmados
                  </span>
                  {!allDone && (
                    <button
                      onClick={() => {
                        for (let i = 0; i < total; i++) {
                          if (!msg.confirmadas?.has(i)) onConfirmarLote(msg.id, i);
                        }
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                    >
                      <CheckCircle2 size={11} />
                      Confirmar todos
                    </button>
                  )}
                  {allDone && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 size={11} /> Todos salvos!
                    </span>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              {msg.transacoes.map((tx, i) => {
                const isConfirmed = msg.confirmadas?.has(i);
                return (
                  <TransacaoCard
                    key={i}
                    tx={tx}
                    status={isConfirmed ? 'confirmada' : undefined}
                    contas={contas}
                    cartoes={cartoes}
                    onConfirmar={(cId, caId) => onConfirmarLote(msg.id, i, cId, caId)}
                    onCancelar={() => {/* ignorar cancelamento individual no lote */}}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-[10px] mt-1 text-slate-600 ${isUser ? 'text-right' : ''}`}>
          {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

/* ── Componente Principal ───────────────────────────────────────────────────── */

export default function Assistente() {
  const [msgs, setMsgs]         = useState<Mensagem[]>([MSG_BOAS_VINDAS]);
  const [texto, setTexto]       = useState('');
  const [gravando, setGravando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const bottomRef        = useRef<HTMLDivElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const cameraInputRef   = useRef<HTMLInputElement>(null);
  const pdfInputRef      = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);

  const { adicionarTransacao, contas, cartoes, transacoes, categorias } = useFinanceiroStore();

  // State for duplicate modal
  const [duplicataPendente, setDuplicataPendente] = useState<{
    tx: TransacaoExtraida;
    origem: OrigemTransacao;
    contaId?: string;
    cartaoId?: string;
    markConfirmed: () => void;
  } | null>(null);
  const [duplicataExistente, setDuplicataExistente] = useState<Transacao | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  function addMsg(parcial: Omit<Mensagem, 'id' | 'ts'> & { id?: string }): string {
    const id = parcial.id ?? gerarId();
    setMsgs(prev => [...prev, { ...parcial, id, ts: Date.now() }]);
    return id;
  }

  function updateMsg(id: string, updates: Partial<Mensagem>) {
    setMsgs(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }

  // ── Confirmar transação ─────────────────────────────────────────────────────

  const confirmarTransacao = useCallback((
    tx: TransacaoExtraida,
    origem: OrigemTransacao,
    contaId?: string,
    cartaoId?: string,
  ) => {
    adicionarTransacao({
      valor:            tx.valor,
      descricao:        tx.descricao,
      categoria_id:     mapCategoria(tx.categoria, tx.tipo),
      data:             tx.data,
      horario:          tx.hora ?? undefined,
      tipo:             tx.tipo,
      metodo_pagamento: mapMetodo(tx.metodo_pagamento),
      parcelas:         tx.parcelas ?? undefined,
      local:            tx.local ?? undefined,
      origem,
      conta_id:         contaId,
      cartao_id:        cartaoId,
    });
  }, [adicionarTransacao]);

  function tentarConfirmar(
    tx: TransacaoExtraida,
    origem: OrigemTransacao,
    markConfirmed: () => void,
    contaId?: string,
    cartaoId?: string,
  ) {
    const duplicata = detectarDuplicata(
      {
        valor: tx.valor,
        categoria_id: mapCategoria(tx.categoria, tx.tipo),
        data: tx.data,
      },
      transacoes,
    );

    if (duplicata) {
      setDuplicataPendente({ tx, origem, contaId, cartaoId, markConfirmed });
      setDuplicataExistente(duplicata);
    } else {
      confirmarTransacao(tx, origem, contaId, cartaoId);
      markConfirmed();
    }
  }

  function onConfirmar(msgId: string, contaId?: string, cartaoId?: string) {
    setMsgs(prev => prev.map(m => {
      if (m.id !== msgId || !m.transacao) return m;
      const tx = m.transacao;
      tentarConfirmar(tx, 'assistente', () => {
        setMsgs(prev2 => prev2.map(m2 =>
          m2.id === msgId ? { ...m2, status: 'confirmada' } : m2,
        ));
      }, contaId, cartaoId);
      return m;
    }));
  }

  function onCancelar(msgId: string) {
    setMsgs(prev => prev.map(m =>
      m.id === msgId ? { ...m, status: 'cancelada' } : m,
    ));
  }

  function onConfirmarLote(msgId: string, idx: number, contaId?: string, cartaoId?: string) {
    if (idx < 0) return;
    setMsgs(prev => prev.map(m => {
      if (m.id !== msgId || !m.transacoes) return m;
      const tx = m.transacoes[idx];
      if (!tx) return m;
      tentarConfirmar(tx, 'assistente_imagem', () => {
        setMsgs(prev2 => prev2.map(m2 => {
          if (m2.id !== msgId) return m2;
          const novasConfirmadas = new Set(m2.confirmadas ?? []);
          novasConfirmadas.add(idx);
          return { ...m2, confirmadas: novasConfirmadas };
        }));
      }, contaId, cartaoId);
      return m;
    }));
  }

  // ── Processar resposta da API ───────────────────────────────────────────────

  async function processarResposta(
    aiMsgId: string,
    res: Response,
    eAudio = false,
    transcricao?: string,
  ) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      updateMsg(aiMsgId, {
        carregando: false,
        texto: `❌ ${err.error ?? 'Erro ao processar. Tente novamente.'}`,
      });
      return;
    }

    const data = await res.json() as {
      tipo: string;
      transacao?: TransacaoExtraida;
      transacoes?: TransacaoExtraida[];
      transcricao?: string;
      resposta: string;
    };

    updateMsg(aiMsgId, {
      carregando:  false,
      texto:       data.resposta,
      transacao:   data.transacao,
      transacoes:  data.transacoes,
      eAudio,
      transcricao: transcricao ?? data.transcricao,
      confirmadas: data.transacoes ? new Set() : undefined,
    });
  }

  // ── Enviar texto ────────────────────────────────────────────────────────────

  async function enviarTexto() {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto('');
    setEnviando(true);

    addMsg({ papel: 'user', texto: t });
    const aiId = addMsg({ papel: 'assistente', texto: '', carregando: true });

    try {
      const contexto = construirContexto({ transacoes, categorias, contas, cartoes });
      const res = await fetch('/api/assistente/texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: t, contexto }),
      });
      await processarResposta(aiId, res);
    } catch {
      updateMsg(aiId, { carregando: false, texto: '❌ Sem conexão. Tente novamente.' });
    } finally {
      setEnviando(false);
    }
  }

  // ── Enviar áudio ────────────────────────────────────────────────────────────

  async function enviarAudio(blob: Blob) {
    setEnviando(true);
    addMsg({ papel: 'user', texto: '🎤 Áudio enviado', eAudio: true });
    const aiId = addMsg({ papel: 'assistente', texto: '', carregando: true });

    try {
      const fd = new FormData();
      fd.append('audio', blob, `audio.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
      const res = await fetch('/api/assistente/audio', { method: 'POST', body: fd });
      await processarResposta(aiId, res, true);
    } catch {
      updateMsg(aiId, { carregando: false, texto: '❌ Erro ao enviar áudio.' });
    } finally {
      setEnviando(false);
    }
  }

  // ── Gravar áudio ────────────────────────────────────────────────────────────

  async function toggleGravacao() {
    if (gravando) {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      setGravando(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        enviarAudio(blob);
      };

      mr.start();
      setGravando(true);

      setTimeout(() => {
        if (mr.state === 'recording') {
          mr.stop();
          stream.getTracks().forEach(t => t.stop());
          setGravando(false);
        }
      }, 60_000);
    } catch {
      addMsg({
        papel: 'assistente',
        texto: '❌ Não foi possível acessar o microfone. Verifique as permissões do navegador.',
      });
    }
  }

  // ── Enviar imagem ────────────────────────────────────────────────────────────

  async function handleImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const imagemPreview = URL.createObjectURL(file);
    setEnviando(true);
    addMsg({ papel: 'user', texto: '', imagemPreview });
    const aiId = addMsg({ papel: 'assistente', texto: '', carregando: true });

    try {
      const fd = new FormData();
      fd.append('imagem', file);
      const res = await fetch('/api/assistente/imagem', { method: 'POST', body: fd });
      await processarResposta(aiId, res);
    } catch {
      updateMsg(aiId, { carregando: false, texto: '❌ Erro ao analisar imagem.' });
    } finally {
      setEnviando(false);
      URL.revokeObjectURL(imagemPreview);
    }
  }

  // ── Enviar PDF ──────────────────────────────────────────────────────────────

  async function handlePDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const tamanhoMB = (file.size / 1024 / 1024).toFixed(1);
    setEnviando(true);

    addMsg({
      papel: 'user',
      texto: '',
      pdfNome: file.name,
      pdfInfo: `${tamanhoMB} MB`,
    });

    const aiId = addMsg({
      papel: 'assistente',
      texto: '',
      pdfNome: file.name,
      carregando: true,
    });

    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await fetch('/api/assistente/pdf', { method: 'POST', body: fd });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        updateMsg(aiId, {
          carregando: false,
          pdfNome: undefined,
          texto: `❌ ${err.error ?? 'Erro ao processar o PDF.'}`,
        });
        return;
      }

      const data = await res.json() as RespostaPDF;

      updateMsg(aiId, {
        carregando:  false,
        pdfNome:     undefined,
        texto:       data.resposta,
        transacoes:  data.transacoes,
        confirmadas: data.transacoes ? new Set() : undefined,
      });
    } catch {
      updateMsg(aiId, {
        carregando: false,
        pdfNome: undefined,
        texto: '❌ Erro ao enviar PDF. Verifique sua conexão.',
      });
    } finally {
      setEnviando(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-3rem)] -mx-4 -mt-0 lg:-mx-6 lg:-mt-0">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0"
          style={{ background: '#0A0E1A' }}>
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
            <Sparkles size={17} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Assistente IA</h2>
            <p className="text-[11px] text-slate-500">Texto · Voz · Foto · Fatura PDF</p>
          </div>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {msgs.map(msg => (
            <Bubble
              key={msg.id}
              msg={msg}
              contas={contas}
              cartoes={cartoes}
              onConfirmar={onConfirmar}
              onCancelar={onCancelar}
              onConfirmarLote={onConfirmarLote}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Indicador de gravação */}
        {gravando && (
          <div className="mx-4 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-medium flex-1">Gravando... Toque no microfone para enviar</span>
            <button onClick={toggleGravacao} className="text-red-400 hover:text-red-300 text-xs font-semibold">
              Parar
            </button>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/[0.06]"
          style={{ background: '#0A0E1A' }}>
          <div className="flex items-end gap-2">

            {/* Botão galeria */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={enviando || gravando}
              className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors disabled:opacity-40 shrink-0"
              aria-label="Escolher imagem da galeria"
              title="Galeria de fotos"
            >
              <ImageIcon size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImagem}
            />

            {/* Botão câmera */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={enviando || gravando}
              className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors disabled:opacity-40 shrink-0"
              aria-label="Tirar foto"
              title="Tirar foto"
            >
              <Camera size={18} />
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImagem}
            />

            {/* Botão de PDF */}
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={enviando || gravando}
              className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-40 shrink-0"
              aria-label="Enviar fatura PDF"
              title="Fatura do cartão (PDF)"
            >
              <CreditCard size={17} />
            </button>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handlePDF}
            />

            {/* Campo de texto */}
            <div className="flex-1 relative">
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviarTexto();
                  }
                }}
                placeholder='Ex: "Paguei R$ 35 no almoço no crédito"'
                disabled={enviando || gravando}
                rows={1}
                className="w-full bg-[#0F1629] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-purple-500/50 disabled:opacity-40 max-h-24 overflow-auto"
                style={{ lineHeight: '1.5' }}
              />
            </div>

            {/* Botão mic / enviar */}
            {texto.trim() ? (
              <button
                onClick={enviarTexto}
                disabled={enviando}
                className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white hover:bg-purple-500 transition-colors disabled:opacity-40 shrink-0"
                aria-label="Enviar"
              >
                {enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            ) : (
              <button
                onClick={toggleGravacao}
                disabled={enviando}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-40
                  ${gravando
                    ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/[0.04] border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                  }`}
                aria-label={gravando ? 'Parar gravação' : 'Gravar áudio'}
              >
                {gravando ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            )}
          </div>

          {/* Dica */}
          <p className="text-[10px] text-slate-700 text-center mt-2">
            <AlertCircle size={9} className="inline mr-1" />
            IA pode cometer erros. Confira os dados antes de confirmar.
          </p>
        </div>
      </div>

      {/* Modal de duplicata */}
      {duplicataExistente && duplicataPendente && (
        <ModalDuplicata
          transacaoExistente={duplicataExistente}
          onConfirmar={() => {
            const { tx, origem, contaId, cartaoId, markConfirmed } = duplicataPendente;
            confirmarTransacao(tx, origem, contaId, cartaoId);
            markConfirmed();
            setDuplicataPendente(null);
            setDuplicataExistente(null);
          }}
          onCancelar={() => {
            setDuplicataPendente(null);
            setDuplicataExistente(null);
          }}
        />
      )}
    </>
  );
}
