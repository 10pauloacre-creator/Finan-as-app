'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Check,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CreditCard,
  Landmark,
  CalendarClock,
  PiggyBank,
  Target,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import {
  FINANCEIRO_STORAGE_EVENT,
  formatarMoeda,
  mesAtual,
  storageContas,
  storageCartoes,
  storageMetas,
  storageReservas,
  storageTransacoes,
} from '@/lib/storage';
import { BANCO_INFO, BancoSlug, TipoConta, ContaBancaria, CartaoCredito, Reserva, Transacao } from '@/types';
import ModalPluggyConnect from '@/components/modais/ModalPluggyConnect';
import BankLogo from '@/components/ui/BankLogo';
import BankSelector from '@/components/ui/BankSelector';
import PainelPrioridadesFinanceiras, { type ItemPrioridadeFinanceira } from '@/components/ui/PainelPrioridadesFinanceiras';
import type { SyncResult } from '@/app/api/pluggy/sync/route';
import { formatFinancialDate, parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import { aplicarDataCompetenciaNaTransacao, getDataOcorrenciaNoMes, transacaoContaNoMesAteData } from '@/lib/transacoes';
import { syncSalvarConta, syncSalvarCartao, syncSalvarTransacao } from '@/lib/sync';

const TIPOS_CONTA: TipoConta[] = ['corrente', 'poupanca', 'digital', 'investimento'];
const LABELS_STATUS = {
  ja_pago: 'Já pago',
  vence_em_breve: 'Vence em breve',
  pendente_mes: 'Pendente no mês',
  futuro: 'Futuro',
} as const;

type StatusPainel = keyof typeof LABELS_STATUS;
type SecaoPainel = 'cartoes' | 'fixas' | 'dividas' | 'reservas';

type ItemPainel = {
  id: string;
  titulo: string;
  subtitulo: string;
  origem: string;
  valor: number;
  dataISO?: string;
  dataLabel: string;
  status: StatusPainel;
  secao: SecaoPainel;
};

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

function diferencaDias(destino: Date, origem: Date) {
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.ceil((inicioDoDia(destino).getTime() - inicioDoDia(origem).getTime()) / msPorDia);
}

function mesmoMesAno(data: Date, referencia: Date) {
  return data.getMonth() === referencia.getMonth() && data.getFullYear() === referencia.getFullYear();
}

function normalizarTexto(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function obterStatusPorData(data: Date, hoje: Date, concluido: boolean): StatusPainel {
  if (concluido) return 'ja_pago';
  const dias = diferencaDias(data, hoje);
  if (dias <= 3) return 'vence_em_breve';
  if (mesmoMesAno(data, hoje)) return 'pendente_mes';
  return 'futuro';
}

function obterVencimentoCartao(cartao: Pick<CartaoCredito, 'dia_vencimento'>, hoje: Date) {
  const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), cartao.dia_vencimento, 0, 0, 0, 0);
  if (vencimento < inicioDoDia(hoje)) vencimento.setMonth(vencimento.getMonth() + 1);
  return vencimento;
}

function obterClasseStatus(status: StatusPainel) {
  if (status === 'ja_pago') return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300';
  if (status === 'vence_em_breve') return 'border-red-500/35 bg-red-500/12 text-red-300';
  if (status === 'pendente_mes') return 'border-amber-500/30 bg-amber-500/12 text-amber-200';
  return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
}

function obterClasseItem(status: StatusPainel) {
  if (status === 'ja_pago') return 'border-emerald-500/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.68))]';
  if (status === 'vence_em_breve') return 'border-red-500/22 bg-[linear-gradient(180deg,rgba(239,68,68,0.14),rgba(15,23,42,0.72))]';
  if (status === 'pendente_mes') return 'border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(15,23,42,0.72))]';
  return 'border-sky-500/16 bg-[linear-gradient(180deg,rgba(56,189,248,0.1),rgba(15,23,42,0.7))]';
}

function SectionPanel({
  title,
  subtitle,
  icon,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: ItemPainel[];
  emptyText: string;
}) {
  return (
    <section className="glass-card overflow-hidden border border-white/10">
      <div className="border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100">
            {icon}
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 ${obterClasseItem(item.status)}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${obterClasseStatus(item.status)}`}>
                    {LABELS_STATUS[item.status]}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.origem}</span>
                </div>
                <h4 className="truncate text-sm font-semibold text-white">{item.titulo}</h4>
                <p className="mt-1 text-xs text-slate-400">{item.subtitulo}</p>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-lg font-bold tabular-nums text-white">{formatarMoeda(item.valor)}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.dataLabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Bancos() {
  const {
    contas,
    cartoes,
    transacoes,
    categorias,
    metas,
    atualizarSaldoConta,
    adicionarConta,
    excluirConta,
    atualizarFaturaCartao,
    adicionarCartao,
    carregarDados,
  } = useFinanceiroStore();
  const { mes, ano } = mesAtual();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoSaldo, setNovoSaldo] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [contaSel, setContaSel] = useState<string | null>(null);
  const [modalPluggy, setModalPluggy] = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [itemsPendentes, setItemsPendentes] = useState<string[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>(() => storageReservas.getAll());

  const [form, setForm] = useState({
    banco: 'outro' as BancoSlug,
    nome: '',
    tipo: 'corrente' as TipoConta,
    saldo: '',
  });
  const hoje = startOfTodayLocal();

  useEffect(() => {
    const atualizarReservas = () => {
      setReservas(storageReservas.getAll());
    };

    atualizarReservas();
    window.addEventListener(FINANCEIRO_STORAGE_EVENT, atualizarReservas as EventListener);
    return () => {
      window.removeEventListener(FINANCEIRO_STORAGE_EVENT, atualizarReservas as EventListener);
    };
  }, []);

  const transacoesPorConta = useMemo(() => {
    const doMes = transacoes.filter((t) => transacaoContaNoMesAteData(t, mes, ano, hoje));
    const mapa: Record<string, typeof doMes> = {};
    doMes.forEach((t) => {
      const chave = t.conta_id || 'sem-conta';
      mapa[chave] = [...(mapa[chave] || []), t];
    });
    return mapa;
  }, [transacoes, mes, ano, hoje]);

  const itemsConectados = useMemo(() => {
    const ids = new Set<string>();
    contas.forEach((c) => {
      if (c.pluggy_item_id) ids.add(c.pluggy_item_id);
    });
    return ids;
  }, [contas]);

  const painelFinanceiro = useMemo(() => {
    const categoriasPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
    const contasPorId = new Map(contas.map((conta) => [conta.id, conta]));
    const reservasPorNome = new Set(reservas.map((reserva) => normalizarTexto(reserva.nome)));
    const metasPorNome = new Set(metas.map((meta) => normalizarTexto(meta.descricao)));
    const itensBase: ItemPainel[] = [];

    transacoes.forEach((transacao) => {
      if (transacao.tipo !== 'despesa' || transacao.cartao_id) return;

      const ocorrencia = getDataOcorrenciaNoMes(transacao, mes, ano);
      if (!ocorrencia) return;

      const categoria = categoriasPorId.get(transacao.categoria_id);
      const dataISO = formatFinancialDate(ocorrencia);
      const data = parseFinancialDate(dataISO);
      const status = obterStatusPorData(data, hoje, data <= inicioDoDia(hoje));
      const textoAnalise = normalizarTexto(`${transacao.descricao} ${categoria?.nome || ''}`);
      const isReserva =
        categoria?.id.includes('reserv') ||
        textoAnalise.includes('reserva') ||
        textoAnalise.includes('caixinha') ||
        reservasPorNome.has(normalizarTexto(transacao.descricao)) ||
        metasPorNome.has(normalizarTexto(transacao.descricao));
      const isDivida =
        transacao.metodo_pagamento === 'emprestimo' ||
        transacao.metodo_pagamento === 'financiamento' ||
        textoAnalise.includes('boleto') ||
        textoAnalise.includes('prestacao') ||
        textoAnalise.includes('financiamento') ||
        textoAnalise.includes('emprestimo');
      const contaOrigem = transacao.conta_id ? contasPorId.get(transacao.conta_id)?.nome : undefined;
      const origem = contaOrigem || (transacao.metodo_pagamento ? `Pago via ${transacao.metodo_pagamento}` : 'Lançamento manual');
      const secao: SecaoPainel = isReserva ? 'reservas' : isDivida ? 'dividas' : 'fixas';
      const subtituloBase = categoria?.nome || 'Sem categoria';
      const subtitulo = transacao.classificacao === 'fixa'
        ? `${subtituloBase} • compromisso recorrente`
        : subtituloBase;

      itensBase.push({
        id: `tx-${transacao.id}-${dataISO}`,
        titulo: transacao.descricao,
        subtitulo,
        origem,
        valor: transacao.valor,
        dataISO,
        dataLabel: `Vencimento ${parseFinancialDate(dataISO).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
        status,
        secao,
      });
    });

    const cartoesPendentes: ItemPainel[] = cartoes
      .filter((cartao) => cartao.fatura_atual > 0)
      .map((cartao) => {
        const vencimento = obterVencimentoCartao(cartao, hoje);
        return {
          id: `cartao-${cartao.id}`,
          titulo: cartao.nome,
          subtitulo: `${BANCO_INFO[cartao.banco].nome} • fecha dia ${cartao.dia_fechamento}`,
          origem: 'Cartão de crédito',
          valor: cartao.fatura_atual,
          dataISO: formatFinancialDate(vencimento),
          dataLabel: vencimento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
          status: obterStatusPorData(vencimento, hoje, false),
          secao: 'cartoes',
        } satisfies ItemPainel;
      })
      .sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || ''));

    const contasFixas = itensBase
      .filter((item) => item.secao === 'fixas' && item.status !== 'ja_pago')
      .sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || '') || b.valor - a.valor);

    const dividasBoletos = itensBase
      .filter((item) => item.secao === 'dividas' && item.status !== 'ja_pago')
      .sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || '') || b.valor - a.valor);

    const reservasMetasTransacionais = itensBase
      .filter((item) => item.secao === 'reservas' && item.status !== 'ja_pago')
      .sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || '') || b.valor - a.valor);

    const metasPainel: ItemPainel[] = storageMetas.getAll().map((meta) => {
      const restante = Math.max(meta.valor_alvo - meta.valor_atual, 0);
      const concluida = restante <= 0;
      const dataPrazo = meta.prazo ? parseFinancialDate(meta.prazo) : null;
      return {
        id: `meta-${meta.id}`,
        titulo: meta.descricao,
        subtitulo: `Meta ${formatarMoeda(meta.valor_alvo)} • atual ${formatarMoeda(meta.valor_atual)}`,
        origem: 'Meta financeira',
        valor: concluida ? meta.valor_atual : restante,
        dataISO: meta.prazo,
        dataLabel: meta.prazo
          ? `Prazo ${dataPrazo?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
          : 'Sem prazo definido',
        status: concluida ? 'ja_pago' : dataPrazo ? obterStatusPorData(dataPrazo, hoje, false) : 'futuro',
        secao: 'reservas',
      };
    });

    const reservasPainel: ItemPainel[] = reservas.map((reserva) => {
      const saldoAtual = reserva.historico.reduce((acc, movimento) => {
        return acc + (movimento.tipo === 'deposito' ? movimento.valor : -movimento.valor);
      }, 0);
      const valorMeta = reserva.tem_meta ? reserva.valor_meta || 0 : 0;
      const restante = Math.max(valorMeta - saldoAtual, 0);
      const concluida = reserva.tem_meta ? restante <= 0 : saldoAtual > 0;
      return {
        id: `reserva-${reserva.id}`,
        titulo: reserva.nome,
        subtitulo: reserva.tem_meta
          ? `Meta ${formatarMoeda(valorMeta)} • saldo ${formatarMoeda(saldoAtual)}`
          : `Saldo acumulado ${formatarMoeda(saldoAtual)}`,
        origem: 'Reserva planejada',
        valor: reserva.tem_meta ? (concluida ? saldoAtual : restante) : saldoAtual,
        dataLabel: reserva.tem_meta ? 'Planejamento contínuo' : 'Acompanhamento',
        status: concluida ? 'ja_pago' : reserva.tem_meta ? 'pendente_mes' : 'futuro',
        secao: 'reservas',
      };
    });

    const reservasMetas = [...reservasMetasTransacionais, ...metasPainel, ...reservasPainel]
      .sort((a, b) => {
        if (a.status === 'vence_em_breve' && b.status !== 'vence_em_breve') return -1;
        if (a.status !== 'vence_em_breve' && b.status === 'vence_em_breve') return 1;
        return (a.dataISO || '9999-12-31').localeCompare(b.dataISO || '9999-12-31');
      });

    const pagosRecentemente = itensBase
      .filter((item) => item.status === 'ja_pago')
      .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '') || b.valor - a.valor)
      .slice(0, 10);

    const totalContas = contas.reduce((acc, conta) => acc + conta.saldo, 0);
    const totalAPagar = [
      ...cartoesPendentes,
      ...itensBase.filter((item) => item.status !== 'ja_pago'),
    ].reduce((acc, item) => acc + item.valor, 0);
    const sobraProjetada = totalContas - totalAPagar;
    const proximosCompromissos = [
      ...cartoesPendentes,
      ...itensBase.filter((item) => item.status !== 'ja_pago'),
    ]
      .filter((item) => item.dataISO)
      .sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || ''));
    const proximoVencimento = proximosCompromissos[0];

    return {
      totalContas,
      totalAPagar,
      sobraProjetada,
      proximoVencimento,
      cartoesPendentes,
      contasFixas,
      dividasBoletos,
      reservasMetas,
      pagosRecentemente,
    };
  }, [cartoes, categorias, contas, metas, mes, ano, hoje, reservas, transacoes]);
  const prioridadesFinanceiras = useMemo<ItemPrioridadeFinanceira[]>(() => {
    const itensAbertos = [
      ...painelFinanceiro.cartoesPendentes,
      ...painelFinanceiro.contasFixas,
      ...painelFinanceiro.dividasBoletos,
      ...painelFinanceiro.reservasMetas,
    ];
    return [
      {
        id: 'bancos-urgente',
        titulo: 'Vence em breve',
        detalhe: 'Itens classificados como urgentes nos próximos dias.',
        quantidade: itensAbertos.filter((item) => item.status === 'vence_em_breve').length,
        tone: 'danger',
      },
      {
        id: 'bancos-pendente',
        titulo: 'Pendente no mês',
        detalhe: 'Compromissos ainda abertos dentro do mês atual.',
        quantidade: itensAbertos.filter((item) => item.status === 'pendente_mes').length,
        tone: 'warning',
      },
      {
        id: 'bancos-pagos',
        titulo: 'Pagos recentemente',
        detalhe: 'Saídas já debitadas e resolvidas neste mês.',
        quantidade: painelFinanceiro.pagosRecentemente.length,
        valor: formatarMoeda(painelFinanceiro.pagosRecentemente.reduce((acc, item) => acc + item.valor, 0)),
        tone: 'info',
      },
      {
        id: 'bancos-sobra',
        titulo: 'Sobra projetada',
        detalhe: 'Saldo em conta menos o total das obrigações abertas.',
        valor: formatarMoeda(painelFinanceiro.sobraProjetada),
        tone: painelFinanceiro.sobraProjetada >= 0 ? 'success' : 'danger',
      },
    ];
  }, [painelFinanceiro]);

  function handleSalvarSaldo(id: string) {
    const val = parseFloat(novoSaldo.replace(',', '.'));
    if (!isNaN(val)) atualizarSaldoConta(id, val);
    setEditandoId(null);
    setNovoSaldo('');
  }

  function handleAdicionarConta(e: React.FormEvent) {
    e.preventDefault();
    adicionarConta({
      banco: form.banco,
      nome: form.nome || BANCO_INFO[form.banco].nome,
      tipo: form.tipo,
      saldo: parseFloat(form.saldo.replace(',', '.')) || 0,
    });
    setForm({ banco: 'outro', nome: '', tipo: 'corrente', saldo: '' });
    setMostrarForm(false);
  }

  function handlePluggySincronizado(resultado: SyncResult) {
    const agora = new Date().toISOString();

    resultado.contas.forEach((contaRecebida) => {
      const existente = storageContas.getAll().find((conta) => conta.pluggy_account_id === contaRecebida.pluggy_account_id);
      if (existente) {
        const contaAtualizada = {
          ...existente,
          banco: contaRecebida.banco,
          nome: contaRecebida.nome,
          tipo: contaRecebida.tipo as TipoConta,
          saldo: contaRecebida.saldo,
          pluggy_item_id: contaRecebida.pluggy_item_id,
          pluggy_account_id: contaRecebida.pluggy_account_id,
          pluggy_sync_em: agora,
          atualizado_em: agora,
        };
        storageContas.save(contaAtualizada);
        void syncSalvarConta(contaAtualizada);
      } else {
        adicionarConta({
          banco: contaRecebida.banco,
          nome: contaRecebida.nome,
          tipo: contaRecebida.tipo as TipoConta,
          saldo: contaRecebida.saldo,
          pluggy_item_id: contaRecebida.pluggy_item_id,
          pluggy_account_id: contaRecebida.pluggy_account_id,
          pluggy_sync_em: agora,
        } as Omit<ContaBancaria, 'id' | 'criado_em'>);
      }
    });

    resultado.cartoes.forEach((cartaoRecebido) => {
      const existente = storageCartoes.getAll().find((cartao) => cartao.pluggy_account_id === cartaoRecebido.pluggy_account_id);
      if (existente) {
        const cartaoAtualizado = {
          ...existente,
          banco: cartaoRecebido.banco,
          nome: cartaoRecebido.nome,
          bandeira: cartaoRecebido.bandeira,
          limite: cartaoRecebido.limite,
          fatura_atual: cartaoRecebido.fatura_atual,
          dia_vencimento: cartaoRecebido.dia_vencimento,
          dia_fechamento: cartaoRecebido.dia_fechamento,
          pluggy_item_id: cartaoRecebido.pluggy_item_id,
          pluggy_account_id: cartaoRecebido.pluggy_account_id,
          pluggy_sync_em: agora,
          atualizado_em: agora,
        };
        storageCartoes.save(cartaoAtualizado);
        void syncSalvarCartao(cartaoAtualizado);
        atualizarFaturaCartao(existente.id, cartaoRecebido.fatura_atual);
      } else {
        adicionarCartao({
          banco: cartaoRecebido.banco,
          nome: cartaoRecebido.nome,
          bandeira: cartaoRecebido.bandeira,
          limite: cartaoRecebido.limite,
          fatura_atual: cartaoRecebido.fatura_atual,
          dia_vencimento: cartaoRecebido.dia_vencimento,
          dia_fechamento: cartaoRecebido.dia_fechamento,
          pluggy_item_id: cartaoRecebido.pluggy_item_id,
          pluggy_account_id: cartaoRecebido.pluggy_account_id,
          pluggy_sync_em: agora,
        } as Omit<CartaoCredito, 'id' | 'criado_em'>);
      }
    });

    carregarDados();
    const idsExistentes = new Set(storageTransacoes.getAll().map((transacao) => transacao.id));
    const contasAtuais = storageContas.getAll();
    resultado.transacoes.forEach((tx) => {
      const txId = `pluggy-${tx.pluggy_id}`;
      if (idsExistentes.has(txId)) return;

      const contaLocal = contasAtuais.find((conta) => conta.pluggy_account_id === tx.pluggy_account_id);
      const transacaoNova = {
        id: txId,
        valor: tx.valor,
        descricao: tx.descricao,
        categoria_id: tx.categoria_id,
        data: tx.data,
        tipo: tx.tipo,
        metodo_pagamento: tx.metodo_pagamento as 'pix' | 'debito' | 'credito' | 'dinheiro' | 'transferencia' | 'outro',
        conta_id: contaLocal?.id,
        origem: 'open_banking',
        criado_em: agora,
        atualizado_em: agora,
      } as Transacao;
      storageTransacoes.save(transacaoNova);
      void syncSalvarTransacao(transacaoNova);
      idsExistentes.add(txId);
    });
    carregarDados();
  }

  const verificarEventosPendentes = useCallback(async () => {
    try {
      const res = await fetch('/api/webhooks/events');
      if (!res.ok) return;
      const { events } = await res.json() as { events: { item_id: string }[] };
      const ids = [...new Set(events.map((event) => event.item_id).filter(Boolean))];
      setItemsPendentes(ids);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(verificarEventosPendentes, 0);
    const interval = setInterval(verificarEventosPendentes, 2 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [verificarEventosPendentes]);

  async function handleResync(itemId: string) {
    setSincronizando(itemId);
    try {
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) throw new Error('Falha na sincronização');
      const data = await res.json() as SyncResult;
      handlePluggySincronizado(data);
      await fetch('/api/webhooks/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      }).catch(() => {});
      setItemsPendentes((prev) => prev.filter((id) => id !== itemId));
    } catch (e) {
      alert(`Erro ao ressincronizar: ${e instanceof Error ? e.message : 'Erro'}`);
    } finally {
      setSincronizando(null);
    }
  }

  async function handleDesconectar(itemId: string) {
    if (!confirm('Desconectar este banco? As contas e transações importadas serão mantidas.')) return;

    await fetch('/api/pluggy/disconnect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });

    storageContas.getAll()
      .filter((conta) => conta.pluggy_item_id === itemId)
      .forEach((conta) => {
        const contaAtualizada = {
          ...conta,
          pluggy_item_id: undefined,
          pluggy_account_id: undefined,
          pluggy_sync_em: undefined,
          atualizado_em: new Date().toISOString(),
        };
        storageContas.save(contaAtualizada);
        void syncSalvarConta(contaAtualizada);
      });

    storageCartoes.getAll()
      .filter((cartao) => cartao.pluggy_item_id === itemId)
      .forEach((cartao) => {
        const cartaoAtualizado = {
          ...cartao,
          pluggy_item_id: undefined,
          pluggy_account_id: undefined,
          pluggy_sync_em: undefined,
          atualizado_em: new Date().toISOString(),
        };
        storageCartoes.save(cartaoAtualizado);
        void syncSalvarCartao(cartaoAtualizado);
      });

    carregarDados();
    setItemsPendentes((prev) => prev.filter((id) => id !== itemId));
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(10,14,26,0.92))] p-5 shadow-[0_24px_60px_rgba(2,6,23,0.30)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
              Versão 3.0
            </div>
            <h2 className="text-2xl font-bold text-white">Central de contas e obrigações</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              A leitura continua priorizando o que exige ação agora, mas com menos peso visual e mais coerência com a home e com Transações.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Saldo em conta</div>
              <div className="mt-2 text-lg font-bold text-emerald-300 tabular-nums">{formatarMoeda(painelFinanceiro.totalContas)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Total a pagar</div>
              <div className="mt-2 text-lg font-bold text-amber-200 tabular-nums">{formatarMoeda(painelFinanceiro.totalAPagar)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Sobra projetada</div>
              <div className={`mt-2 text-lg font-bold tabular-nums ${painelFinanceiro.sobraProjetada >= 0 ? 'text-sky-200' : 'text-red-300'}`}>
                {formatarMoeda(painelFinanceiro.sobraProjetada)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Próximo vencimento</div>
              <div className="mt-2 text-sm font-bold text-white">
                {painelFinanceiro.proximoVencimento?.dataISO
                  ? parseFinancialDate(painelFinanceiro.proximoVencimento.dataISO).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                  : 'Sem pendências'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {painelFinanceiro.proximoVencimento ? painelFinanceiro.proximoVencimento.titulo : 'Nada aberto agora'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3 text-[11px] text-slate-500">
        <div><span className="text-slate-300">Saldo em conta:</span> soma dos saldos atuais de todas as contas cadastradas.</div>
        <div className="mt-1"><span className="text-slate-300">Total a pagar:</span> faturas dos cartões + contas fixas + dívidas + aportes planejados ainda abertos.</div>
        <div className="mt-1"><span className="text-slate-300">Sobra projetada:</span> saldo em conta menos tudo o que ainda falta cumprir.</div>
      </div>

      <PainelPrioridadesFinanceiras
        itens={prioridadesFinanceiras}
        subtitulo="A mesma lógica de prioridade usada na home, aplicada ao painel operacional de contas."
      />

      {itemsPendentes.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-200">Dados novos disponíveis. Atualize para refletir os últimos lançamentos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {itemsPendentes.map((itemId) => (
              <button
                key={itemId}
                onClick={() => handleResync(itemId)}
                disabled={sincronizando === itemId}
                className="flex items-center gap-1 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
              >
                <RefreshCw size={11} className={sincronizando === itemId ? 'animate-spin' : ''} />
                Atualizar
              </button>
            ))}
          </div>
        </div>
      )}

      {itemsConectados.size > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/18 bg-emerald-950/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Wifi size={15} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs font-medium text-emerald-300">
              {itemsConectados.size} banco{itemsConectados.size > 1 ? 's' : ''} conectado{itemsConectados.size > 1 ? 's' : ''} via Open Finance
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(itemsConectados).map((itemId) => (
              <div key={itemId} className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1">
                <button
                  onClick={() => handleResync(itemId)}
                  disabled={sincronizando === itemId}
                  title="Ressincronizar"
                  className="rounded-lg p-1 text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={sincronizando === itemId ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => handleDesconectar(itemId)}
                  title="Desconectar"
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <WifiOff size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionPanel
          title="Faturas dos cartões"
          subtitle="Status de faturas inteiras para vencer, sem misturar com outras despesas do mês."
          icon={<CreditCard size={18} />}
          items={painelFinanceiro.cartoesPendentes}
          emptyText="Nenhuma fatura pendente agora."
        />

        <SectionPanel
          title="Contas fixas do mês"
          subtitle="Compromissos recorrentes organizados pelo que precisa de atenção antes."
          icon={<CalendarClock size={18} />}
          items={painelFinanceiro.contasFixas}
          emptyText="Nenhuma conta fixa pendente no mês atual."
        />

        <SectionPanel
          title="Dívidas e boletos"
          subtitle="Financiamentos, empréstimos e cobranças avulsas com leitura por urgência."
          icon={<Landmark size={18} />}
          items={painelFinanceiro.dividasBoletos}
          emptyText="Nenhum boleto ou dívida extra aguardando pagamento."
        />

        <SectionPanel
          title="Reservas e metas"
          subtitle="Aportes planejados, metas financeiras e reservas visíveis no mesmo fluxo."
          icon={<PiggyBank size={18} />}
          items={painelFinanceiro.reservasMetas}
          emptyText="Nenhuma reserva ou meta cadastrada ainda."
        />
      </div>

      <SectionPanel
        title="Pagos recentemente"
        subtitle="Saídas já debitadas do saldo neste mês para você acompanhar o que já foi resolvido."
        icon={<Target size={18} />}
        items={painelFinanceiro.pagosRecentemente}
        emptyText="Ainda não houve debitações registradas neste mês."
      />

      <section className="glass-card overflow-hidden border border-white/10">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Saldos das contas e conexões</h3>
            <p className="text-xs text-slate-400">A área operacional continua aqui para ajuste de saldo, conexão bancária e cadastro manual.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModalPluggy(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
            >
              <Wifi size={14} />
              <span className="hidden sm:inline">Conectar</span>
            </button>
            <button
              onClick={() => setMostrarForm((valorAtual) => !valorAtual)}
              className="btn-primary flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} /> Nova Conta
            </button>
          </div>
        </div>

        {mostrarForm && (
          <form onSubmit={handleAdicionarConta} className="border-b border-white/[0.06] p-5 space-y-4">
            <h4 className="text-sm font-semibold text-sky-200">Adicionar conta manual</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Banco *</label>
                <BankSelector
                  selected={form.banco}
                  onChange={(banco) => setForm((estadoAtual) => ({ ...estadoAtual, banco }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((estadoAtual) => ({ ...estadoAtual, tipo: e.target.value as TipoConta }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  {TIPOS_CONTA.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Nome (opcional)</label>
                <input
                  type="text"
                  placeholder={BANCO_INFO[form.banco].nome}
                  value={form.nome}
                  onChange={(e) => setForm((estadoAtual) => ({ ...estadoAtual, nome: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Saldo atual (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  step="0.01"
                  value={form.saldo}
                  onChange={(e) => setForm((estadoAtual) => ({ ...estadoAtual, saldo: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-white">Salvar</button>
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/10"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3 p-4">
          {contas.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] py-14 text-slate-600">
              <Building2 size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">Nenhuma conta cadastrada</p>
              <p className="mt-1 text-xs">Conecte seu banco via Open Finance ou crie manualmente.</p>
            </div>
          )}

          {contas.map((conta) => {
            const info = BANCO_INFO[conta.banco];
            const txConta = transacoesPorConta[conta.id] || [];
            const recMes = txConta.filter((transacao) => transacao.tipo === 'receita').reduce((soma, transacao) => soma + transacao.valor, 0);
            const despMes = txConta.filter((transacao) => transacao.tipo === 'despesa').reduce((soma, transacao) => soma + transacao.valor, 0);
            const isEdit = editandoId === conta.id;
            const isOpen = contaSel === conta.id;
            const conectado = !!conta.pluggy_item_id;

            return (
              <div key={conta.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]">
                <div className="h-[3px]" style={{ background: info.cor }} />
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <BankLogo banco={conta.banco} size={44} className="h-11 w-11 object-contain flex-shrink-0" />
                      {conectado && (
                        <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#0F1629] bg-emerald-500">
                          <Wifi size={8} className="text-white" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{info.nome}</div>
                      <div className="text-xs text-slate-500 capitalize">
                        {conta.tipo} - {conta.nome}
                        {conectado && <span className="ml-1 text-emerald-500">- Open Finance</span>}
                      </div>
                    </div>

                    {isEdit ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          autoFocus
                          value={novoSaldo}
                          onChange={(e) => setNovoSaldo(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSalvarSaldo(conta.id)}
                          placeholder={conta.saldo.toString()}
                          className="w-28 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500 tabular-nums"
                        />
                        <button onClick={() => handleSalvarSaldo(conta.id)} className="rounded-lg p-1 text-emerald-400 transition-colors hover:bg-emerald-900/20 hover:text-emerald-300">
                          <Check size={16} />
                        </button>
                        <button onClick={() => setEditandoId(null)} className="rounded-lg p-1 text-slate-500 transition-colors hover:text-slate-300">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums" style={{ color: conta.saldo >= 0 ? '#F1F5F9' : '#EF4444' }}>
                            {formatarMoeda(conta.saldo)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {conectado && conta.pluggy_sync_em
                              ? `sync ${new Date(conta.pluggy_sync_em).toLocaleDateString('pt-BR')}`
                              : 'saldo atual'}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!conectado && (
                            <button
                              onClick={() => {
                                setEditandoId(conta.id);
                                setNovoSaldo(conta.saldo.toString());
                              }}
                              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                              aria-label="Editar saldo"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => confirm('Excluir esta conta?') && excluirConta(conta.id)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            aria-label="Excluir conta"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white/[0.03] p-3 text-center">
                      <div className="text-sm font-semibold tabular-nums text-emerald-400">{formatarMoeda(recMes)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">Entradas do mês</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-3 text-center">
                      <div className="text-sm font-semibold tabular-nums text-red-400">{formatarMoeda(despMes)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">Saídas do mês</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-3 text-center">
                      <div className="text-sm font-semibold text-slate-300">{txConta.length}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">Transações</div>
                    </div>
                  </div>

                  {txConta.length > 0 && (
                    <button
                      onClick={() => setContaSel(isOpen ? null : conta.id)}
                      className="mt-3 w-full py-1 text-center text-xs text-slate-500 transition-colors hover:text-sky-300"
                    >
                      {isOpen ? 'Ocultar' : `Ver ${txConta.length} transações`}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-2 space-y-2 border-t border-white/[0.05] px-5 pb-4">
                    {txConta.slice(0, 8).map((transacao) => {
                      const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                      const cartao = transacao.cartao_id ? cartoes.find((item) => item.id === transacao.cartao_id) : undefined;
                      const dataLista = transacao.tipo === 'despesa'
                        ? aplicarDataCompetenciaNaTransacao(transacao, cartao).data
                        : transacao.data;

                      return (
                        <div key={transacao.id} className="flex items-center gap-3">
                          <div
                            className="h-6 w-1 flex-shrink-0 rounded-full"
                            style={{ background: transacao.tipo === 'receita' ? '#10B981' : '#EF4444' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-300">{transacao.descricao}</div>
                            <div className="text-[11px] text-slate-600">
                              {categoria?.nome} - {parseFinancialDate(dataLista).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </div>
                          </div>
                          <div className={`text-xs font-semibold tabular-nums ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {transacao.tipo === 'receita' ? '+' : '-'}{formatarMoeda(transacao.valor)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <ModalPluggyConnect
        aberto={modalPluggy}
        onFechar={() => setModalPluggy(false)}
        onSincronizado={handlePluggySincronizado}
      />
    </div>
  );
}
