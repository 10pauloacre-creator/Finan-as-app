'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Check, Eye, EyeOff, Pencil,
  PiggyBank, Plus, Sparkles, Target, Trash2, Wallet, X,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { FINANCEIRO_STORAGE_EVENT, formatarMoeda, gerarId, storageReservas } from '@/lib/storage';
import { formatFinancialDate } from '@/lib/date';
import { BANCO_INFO, BancoSlug, MovimentoReserva, Reserva } from '@/types';
import { syncExcluirReserva, syncSalvarReserva } from '@/lib/sync';
import BankLogo from '@/components/ui/BankLogo';
import BankSelector from '@/components/ui/BankSelector';

function lerListaPersistida<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

type GrupoManual = 'imoveis' | 'veiculos' | 'outros';
type TipoMovimentoReserva = 'deposito' | 'retirada';

interface ItemManual {
  id: string;
  nome: string;
  valor: number;
  grupo: GrupoManual;
  icone: string;
}

interface ReservaFormData {
  nome: string;
  banco: BancoSlug;
  percentual_selic: number;
  tem_meta: boolean;
  valor_meta?: number;
  descricao?: string;
  icone: string;
  saldo_inicial: number;
}

const STORAGE_ITENS_MANUAIS = 'fin_patrimonio_manuais';

const GRUPO_INFO: Record<GrupoManual, { label: string; cor: string; icone: string }> = {
  imoveis: { label: 'Imoveis', cor: '#F59E0B', icone: '🏠' },
  veiculos: { label: 'Veiculos', cor: '#3B82F6', icone: '🚗' },
  outros: { label: 'Outros', cor: '#6B7280', icone: '📦' },
};

const RESERVA_ICONES = ['🛟', '💰', '🏦', '🎯', '🧳', '🏖️', '🏡', '🧠', '🛒', '🚘'];

function BarraProgresso({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: cor }}
      />
    </div>
  );
}

function calcularSaldoReserva(reserva: Reserva) {
  return reserva.historico.reduce((soma, movimento) => (
    soma + (movimento.tipo === 'deposito' ? movimento.valor : -movimento.valor)
  ), 0);
}

function calcularTaxaAnualReserva(percentualSelic: number, selicAtual: number | null) {
  if (selicAtual === null) return null;
  return selicAtual * (percentualSelic / 100);
}

function calcularTaxaMensal(jurosAnual: number) {
  return Math.pow(1 + jurosAnual / 100, 1 / 12) - 1;
}

function projetarReserva(valor: number, jurosAnual: number, meses: number) {
  const taxaMensal = calcularTaxaMensal(jurosAnual);
  return valor * Math.pow(1 + taxaMensal, meses);
}

interface ModalItemProps {
  item?: ItemManual;
  onSalvar: (item: Omit<ItemManual, 'id'>) => void;
  onFechar: () => void;
}

function ModalItemManual({ item, onSalvar, onFechar }: ModalItemProps) {
  const [nome, setNome] = useState(item?.nome || '');
  const [valor, setValor] = useState(item?.valor?.toString() || '');
  const [grupo, setGrupo] = useState<GrupoManual>(item?.grupo || 'outros');
  const [icone, setIcone] = useState(item?.icone || GRUPO_INFO[item?.grupo || 'outros'].icone);

  const iconesSugeridos = ['🏠', '🏢', '🏗️', '🚗', '🏍️', '🚢', '✈️', '💎', '📦', '🌳', '🛋️', '🏋️'];

  function handleSalvar() {
    const valorNumerico = parseFloat(valor.replace(',', '.'));
    if (!nome.trim() || Number.isNaN(valorNumerico) || valorNumerico <= 0) return;
    onSalvar({ nome: nome.trim(), valor: valorNumerico, grupo, icone });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-5 border border-white/10"
        style={{ background: '#0E1220' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{item ? 'Editar ativo' : 'Novo ativo'}</h3>
          <button onClick={onFechar} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-2 block">Icone</label>
          <div className="flex flex-wrap gap-2">
            {iconesSugeridos.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcone(ic)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  icone === ic ? 'ring-2 ring-purple-500 bg-purple-900/30' : 'bg-white/[0.05] hover:bg-white/10'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Nome do ativo</label>
          <input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex: Apartamento, terreno..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Categoria</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(GRUPO_INFO) as [GrupoManual, typeof GRUPO_INFO[GrupoManual]][]).map(([itemGrupo, info]) => (
              <button
                key={itemGrupo}
                type="button"
                onClick={() => { setGrupo(itemGrupo); setIcone(info.icone); }}
                className={`py-2 rounded-xl text-xs font-medium transition-all ${
                  grupo === itemGrupo
                    ? 'text-white border-2'
                    : 'bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white'
                }`}
                style={grupo === itemGrupo ? { background: `${info.cor}22`, borderColor: info.cor, color: info.cor } : {}}
              >
                {info.icone} {info.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Valor (R$)</label>
          <input
            type="number"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            placeholder="0,00"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
          />
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          className="w-full btn-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Check size={16} /> {item ? 'Salvar alteracoes' : 'Adicionar ativo'}
        </button>
      </div>
    </div>
  );
}

interface ModalReservaProps {
  reserva?: Reserva;
  onSalvar: (dados: ReservaFormData) => void;
  onFechar: () => void;
}

function ModalReserva({ reserva, onSalvar, onFechar }: ModalReservaProps) {
  const bancoInicial = reserva?.banco || 'nubank';
  const [nome, setNome] = useState(reserva?.nome || '');
  const [banco, setBanco] = useState<BancoSlug>(bancoInicial);
  const corBanco = BANCO_INFO[banco]?.cor || '#10B981';
  const [percentualSelic, setPercentualSelic] = useState(String(reserva?.percentual_selic ?? 100));
  const [temMeta, setTemMeta] = useState(reserva?.tem_meta || false);
  const [valorMeta, setValorMeta] = useState(reserva?.valor_meta?.toString() || '');
  const [descricao, setDescricao] = useState(reserva?.descricao || '');
  const [icone, setIcone] = useState(reserva?.icone || '🛟');
  const [saldoInicial, setSaldoInicial] = useState(reserva ? '' : '');

  function handleSalvar() {
    const percentual = parseFloat(percentualSelic.replace(',', '.'));
    const meta = valorMeta ? parseFloat(valorMeta.replace(',', '.')) : undefined;
    const saldo = saldoInicial ? parseFloat(saldoInicial.replace(',', '.')) : 0;

    if (!nome.trim() || Number.isNaN(percentual) || percentual <= 0) return;
    if (temMeta && (!meta || meta <= 0)) return;
    if (!reserva && saldo < 0) return;

    onSalvar({
      nome: nome.trim(),
      banco,
      percentual_selic: percentual,
      tem_meta: temMeta,
      valor_meta: temMeta ? meta : undefined,
      descricao: descricao.trim() || undefined,
      icone,
      saldo_inicial: saldo,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5 border border-white/10 max-h-[90vh] overflow-y-auto"
        style={{ background: '#0E1220' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">{reserva ? 'Editar reserva' : 'Nova reserva'}</h3>
            <p className="text-xs text-slate-500 mt-1">Crie uma caixinha personalizada com meta, banco e projecoes.</p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-2 block">Icone</label>
          <div className="flex flex-wrap gap-2">
            {RESERVA_ICONES.map((itemIcone) => (
              <button
                key={itemIcone}
                type="button"
                onClick={() => setIcone(itemIcone)}
                className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                  icone === itemIcone ? 'ring-2 ring-emerald-500 bg-emerald-900/20' : 'bg-white/[0.05] hover:bg-white/10'
                }`}
              >
                {itemIcone}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Nome da reserva</label>
            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex: Emergencia, viagem, carro..."
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Banco</label>
            <BankSelector selected={banco} onChange={setBanco} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">% da Selic</label>
            <input
              type="number"
              value={percentualSelic}
              onChange={(event) => setPercentualSelic(event.target.value)}
              placeholder="100"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-600 mt-1">Ex: `100` = rende 100% da Selic.</p>
          </div>

          {!reserva && (
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Saldo inicial</label>
              <input
                type="number"
                value={saldoInicial}
                onChange={(event) => setSaldoInicial(event.target.value)}
                placeholder="0,00"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 p-3 bg-white/[0.03]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Essa reserva tem meta?</p>
              <p className="text-xs text-slate-500">Mostramos progresso, quanto falta e percentual concluido.</p>
            </div>
            <button
              type="button"
              onClick={() => setTemMeta((valorAtual) => !valorAtual)}
              className={`w-12 h-7 rounded-full transition-all relative ${temMeta ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${temMeta ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>

          {temMeta && (
            <div className="mt-3">
              <label className="text-xs text-slate-500 mb-1.5 block">Valor da meta</label>
              <input
                type="number"
                value={valorMeta}
                onChange={(event) => setValorMeta(event.target.value)}
                placeholder="10000"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Descricao opcional</label>
          <textarea
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            rows={3}
            placeholder="Ex: reserva de emergencia, caixa da viagem..."
            className="w-full resize-none bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
          />
        </div>

        <div className="rounded-2xl p-3 border border-white/10" style={{ background: `${corBanco}14` }}>
          <p className="text-xs text-slate-400 mb-1">Banco selecionado</p>
          <div className="flex items-center gap-3">
            <BankLogo banco={banco} size={36} className="h-9 w-9 object-contain" />
            <p className="text-sm font-semibold" style={{ color: corBanco }}>{BANCO_INFO[banco].nome}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          className="w-full btn-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Check size={16} /> {reserva ? 'Salvar reserva' : 'Criar reserva'}
        </button>
      </div>
    </div>
  );
}

interface ModalMovimentoReservaProps {
  reserva: Reserva;
  tipoInicial: TipoMovimentoReserva;
  onSalvar: (dados: Omit<MovimentoReserva, 'id'>) => void;
  onFechar: () => void;
}

function ModalMovimentoReserva({ reserva, tipoInicial, onSalvar, onFechar }: ModalMovimentoReservaProps) {
  const [tipo, setTipo] = useState<TipoMovimentoReserva>(tipoInicial);
  const [valor, setValor] = useState('');
  const [data, setData] = useState(formatFinancialDate(new Date()));
  const [descricao, setDescricao] = useState('');

  function handleSalvar() {
    const valorNumerico = parseFloat(valor.replace(',', '.'));
    if (Number.isNaN(valorNumerico) || valorNumerico <= 0) return;

    onSalvar({
      tipo,
      valor: valorNumerico,
      data,
      descricao: descricao.trim() || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-5 border border-white/10"
        style={{ background: '#0E1220' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              {tipo === 'deposito' ? 'Novo deposito' : 'Nova retirada'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{reserva.nome}</p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo('deposito')}
            className={`py-2 rounded-xl text-sm font-medium transition-all ${
              tipo === 'deposito' ? 'bg-emerald-600 text-white' : 'bg-white/[0.05] text-slate-400'
            }`}
          >
            Deposito
          </button>
          <button
            type="button"
            onClick={() => setTipo('retirada')}
            className={`py-2 rounded-xl text-sm font-medium transition-all ${
              tipo === 'retirada' ? 'bg-red-600 text-white' : 'bg-white/[0.05] text-slate-400'
            }`}
          >
            Retirada
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Valor</label>
          <input
            type="number"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            placeholder="0,00"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Data</label>
          <input
            type="date"
            value={data}
            onChange={(event) => setData(event.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Descricao</label>
          <input
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            placeholder="Ex: aporte mensal, retirada para viagem..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          className="w-full btn-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Check size={16} /> Salvar movimento
        </button>
      </div>
    </div>
  );
}

export default function Patrimonio() {
  const { contas, cartoes, investimentos, selicAtual } = useFinanceiroStore();
  const [oculto, setOculto] = useState(false);
  const [itensManual, setItensManual] = useState<ItemManual[]>(() => lerListaPersistida<ItemManual>(STORAGE_ITENS_MANUAIS));
  const [reservas, setReservas] = useState<Reserva[]>(() => storageReservas.getAll());
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditar, setItemEditar] = useState<ItemManual | undefined>();
  const [modalReservaAberto, setModalReservaAberto] = useState(false);
  const [reservaEditar, setReservaEditar] = useState<Reserva | undefined>();
  const [movimentoReserva, setMovimentoReserva] = useState<{ reserva: Reserva; tipo: TipoMovimentoReserva } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_ITENS_MANUAIS, JSON.stringify(itensManual));
  }, [itensManual]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recarregarReservas = () => {
      setReservas(storageReservas.getAll());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'fin_reservas') return;
      recarregarReservas();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FINANCEIRO_STORAGE_EVENT, recarregarReservas as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FINANCEIRO_STORAGE_EVENT, recarregarReservas as EventListener);
    };
  }, []);

  const totais = useMemo(() => {
    const saldoContas = contas.reduce((soma, conta) => soma + conta.saldo, 0);
    const faturaCartoes = cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual, 0);
    const totalInvest = investimentos.reduce((soma, investimento) => soma + (investimento.valor_atual ?? investimento.valor_investido), 0);
    const totalManual = itensManual.reduce((soma, item) => soma + item.valor, 0);
    const totalReservas = reservas.reduce((soma, reserva) => soma + calcularSaldoReserva(reserva), 0);
    const totalAtivos = saldoContas + totalInvest + totalManual + totalReservas;
    const liquido = totalAtivos - faturaCartoes;
    return { saldoContas, faturaCartoes, totalInvest, totalManual, totalReservas, totalAtivos, liquido };
  }, [contas, cartoes, investimentos, itensManual, reservas]);

  const qtdGrupos = [
    contas.length > 0,
    investimentos.length > 0,
    cartoes.length > 0,
    itensManual.length > 0,
    reservas.length > 0,
  ].filter(Boolean).length;

  const qtdAtivos = contas.length + investimentos.length + cartoes.length + itensManual.length + reservas.length;
  const ocultarValor = (valor: string) => (oculto ? '••••••' : valor);

  function handleSalvarManual(dados: Omit<ItemManual, 'id'>) {
    if (itemEditar) {
      setItensManual((atual) => atual.map((item) => (
        item.id === itemEditar.id ? { ...dados, id: item.id } : item
      )));
    } else {
      setItensManual((atual) => [...atual, { ...dados, id: gerarId() }]);
    }

    setModalAberto(false);
    setItemEditar(undefined);
  }

  function handleExcluirManual(id: string) {
    if (confirm('Remover este ativo?')) {
      setItensManual((atual) => atual.filter((item) => item.id !== id));
    }
  }

  function handleSalvarReserva(dados: ReservaFormData) {
    const infoBanco = BANCO_INFO[dados.banco] || BANCO_INFO.outro;

    if (reservaEditar) {
      const atualizada: Reserva = {
        ...reservaEditar,
        nome: dados.nome,
        banco: dados.banco,
        percentual_selic: dados.percentual_selic,
        tem_meta: dados.tem_meta,
        valor_meta: dados.valor_meta,
        descricao: dados.descricao,
        icone: dados.icone,
        cor: infoBanco.cor,
      };
      storageReservas.save(atualizada);
      void syncSalvarReserva(atualizada);
      setReservas((atual) => atual.map((reserva) => (
        reserva.id === reservaEditar.id ? atualizada : reserva
      )));
    } else {
      const historicoInicial: MovimentoReserva[] = dados.saldo_inicial > 0 ? [{
        id: gerarId(),
        tipo: 'deposito',
        valor: dados.saldo_inicial,
        data: formatFinancialDate(new Date()),
        descricao: 'Saldo inicial',
      }] : [];

      const novaReserva: Reserva = {
        id: gerarId(),
        nome: dados.nome,
        banco: dados.banco,
        percentual_selic: dados.percentual_selic,
        tem_meta: dados.tem_meta,
        valor_meta: dados.valor_meta,
        descricao: dados.descricao,
        icone: dados.icone,
        cor: infoBanco.cor,
        historico: historicoInicial,
        criado_em: new Date().toISOString(),
      };
      storageReservas.save(novaReserva);
      void syncSalvarReserva(novaReserva);
      setReservas((atual) => [novaReserva, ...atual]);
    }

    setModalReservaAberto(false);
    setReservaEditar(undefined);
  }

  function handleExcluirReserva(id: string) {
    if (confirm('Remover esta reserva?')) {
      storageReservas.delete(id);
      void syncExcluirReserva(id);
      setReservas((atual) => atual.filter((reserva) => reserva.id !== id));
    }
  }

  function handleSalvarMovimentoReserva(dados: Omit<MovimentoReserva, 'id'>) {
    if (!movimentoReserva) return;

    const saldoAtual = calcularSaldoReserva(movimentoReserva.reserva);
    if (dados.tipo === 'retirada' && dados.valor > saldoAtual) {
      alert('A retirada nao pode ser maior que o saldo atual da reserva.');
      return;
    }

    setReservas((atual) => atual.map((reserva) => {
      if (reserva.id !== movimentoReserva.reserva.id) return reserva;

      const atualizada: Reserva = {
        ...reserva,
        historico: [
          { id: gerarId(), ...dados },
          ...reserva.historico,
        ],
      };

      storageReservas.save(atualizada);
      void syncSalvarReserva(atualizada);
      return atualizada;
    }));

    setMovimentoReserva(null);
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mb-1">Patrimonio liquido</p>
          <div className="flex items-center gap-3">
            <h1
              className="text-3xl font-bold tabular-nums"
              style={{
                background: 'linear-gradient(135deg, #F1F5F9 0%, #A78BFA 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {oculto ? 'R$ ••••••' : formatarMoeda(totais.liquido)}
            </h1>
            <button
              onClick={() => setOculto((valorAtual) => !valorAtual)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
            >
              {oculto ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <p className="text-slate-500 text-sm mt-1">{qtdAtivos} ativos · {qtdGrupos} grupos</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setReservaEditar(undefined); setModalReservaAberto(true); }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          >
            <PiggyBank size={16} /> Reserva
          </button>
          <button
            onClick={() => { setItemEditar(undefined); setModalAberto(true); }}
            className="btn-primary flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Plus size={16} /> Ativo
          </button>
        </div>
      </div>

      {contas.length > 0 && (
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🏦</span>
              <span className="text-sm font-semibold text-slate-200">Contas bancarias</span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {ocultarValor(formatarMoeda(totais.saldoContas))}
            </span>
          </div>
          <div className="space-y-3">
            {contas.map((conta) => {
              const info = BANCO_INFO[conta.banco] || BANCO_INFO.outro;
              const pct = totais.totalAtivos > 0 ? (conta.saldo / totais.totalAtivos) * 100 : 0;
              return (
                <div key={conta.id}>
                  <div className="flex items-center gap-3">
                    <BankLogo banco={conta.banco} size={32} className="h-8 w-8 object-contain flex-shrink-0" />
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
            {investimentos.map((investimento) => {
              const valorAtual = investimento.valor_atual ?? investimento.valor_investido;
              const pct = totais.totalAtivos > 0 ? (valorAtual / totais.totalAtivos) * 100 : 0;
              const rentabilidade = investimento.valor_investido > 0
                ? ((valorAtual - investimento.valor_investido) / investimento.valor_investido) * 100
                : 0;

              return (
                <div key={investimento.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center text-sm">
                      💰
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{investimento.nome}</span>
                        <span className="text-sm font-semibold text-white tabular-nums">{ocultarValor(formatarMoeda(valorAtual))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{investimento.tipo.replace(/_/g, ' ')}</span>
                        <span className={`text-xs font-medium ${rentabilidade >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {rentabilidade >= 0 ? '+' : ''}{rentabilidade.toFixed(2)}%
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

      <section className="glass-card p-5" style={{ borderColor: 'rgba(16,185,129,0.18)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🛟</span>
            <div>
              <span className="text-sm font-semibold text-slate-200 block">Reservas</span>
              <span className="text-xs text-slate-500">Caixinhas personalizadas com meta, banco e projeção.</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {ocultarValor(formatarMoeda(totais.totalReservas))}
            </span>
            <button
              onClick={() => { setReservaEditar(undefined); setModalReservaAberto(true); }}
              className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all"
              aria-label="Nova reserva"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {reservas.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <div className="text-3xl mb-2 opacity-50">🛟</div>
            <p className="text-sm font-medium text-slate-500">Nenhuma reserva criada</p>
            <p className="text-xs mt-1 text-slate-600">Crie reservas para emergencia, viagem, carro, casa e o que mais fizer sentido.</p>
            <button
              onClick={() => { setReservaEditar(undefined); setModalReservaAberto(true); }}
              className="mt-4 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto"
            >
              <Plus size={12} /> Criar primeira reserva
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {reservas.map((reserva) => {
              const saldoAtual = calcularSaldoReserva(reserva);
              const pctAtivo = totais.totalAtivos > 0 ? (saldoAtual / totais.totalAtivos) * 100 : 0;
              const progressoMeta = reserva.tem_meta && reserva.valor_meta
                ? (saldoAtual / reserva.valor_meta) * 100
                : 0;
              const faltaMeta = reserva.tem_meta && reserva.valor_meta
                ? Math.max(reserva.valor_meta - saldoAtual, 0)
                : 0;
              const taxaAnual = calcularTaxaAnualReserva(reserva.percentual_selic, selicAtual);
              const rendimentoMensalEstimado = taxaAnual !== null ? saldoAtual * calcularTaxaMensal(taxaAnual) : null;
              const projecao6m = taxaAnual !== null ? projetarReserva(saldoAtual, taxaAnual, 6) : null;
              const projecao12m = taxaAnual !== null ? projetarReserva(saldoAtual, taxaAnual, 12) : null;
              const bancoInfo = BANCO_INFO[reserva.banco] || BANCO_INFO.outro;

              return (
                <div key={reserva.id} className="rounded-2xl border border-white/10 p-4 bg-white/[0.02]">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: `${reserva.cor}22` }}
                    >
                      {reserva.icone}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-white">{reserva.nome}</h3>
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5"
                              style={{ color: bancoInfo.cor, borderColor: `${bancoInfo.cor}55`, background: `${bancoInfo.cor}14` }}
                            >
                              <BankLogo banco={reserva.banco} size={16} className="h-4 w-4 object-contain" />
                              {bancoInfo.nome}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {reserva.percentual_selic.toFixed(0)}% da Selic
                            {taxaAnual !== null ? ` • aprox. ${taxaAnual.toFixed(2)}% a.a.` : ''}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-400 tabular-nums">
                            {ocultarValor(formatarMoeda(saldoAtual))}
                          </div>
                          <div className="text-[11px] text-slate-500">{pctAtivo.toFixed(1)}% dos ativos</div>
                        </div>
                      </div>

                      {reserva.descricao && (
                        <p className="text-xs text-slate-400 mt-3 leading-relaxed">{reserva.descricao}</p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                        <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/15">
                          <div className="text-[11px] text-slate-500 mb-1">Estimativa mensal</div>
                          <div className="text-sm font-semibold text-emerald-400 tabular-nums">
                            {rendimentoMensalEstimado !== null ? ocultarValor(formatarMoeda(rendimentoMensalEstimado)) : 'Defina a Selic'}
                          </div>
                        </div>
                        <div className="rounded-xl p-3 bg-white/[0.03] border border-white/10">
                          <div className="text-[11px] text-slate-500 mb-1">Projecao 6 meses</div>
                          <div className="text-sm font-semibold text-white tabular-nums">
                            {projecao6m !== null ? ocultarValor(formatarMoeda(projecao6m)) : '--'}
                          </div>
                        </div>
                        <div className="rounded-xl p-3 bg-white/[0.03] border border-white/10">
                          <div className="text-[11px] text-slate-500 mb-1">Projecao 12 meses</div>
                          <div className="text-sm font-semibold text-white tabular-nums">
                            {projecao12m !== null ? ocultarValor(formatarMoeda(projecao12m)) : '--'}
                          </div>
                        </div>
                      </div>

                      {reserva.tem_meta && reserva.valor_meta && (
                        <div className="mt-4 rounded-2xl p-3 border border-emerald-500/15 bg-emerald-500/6">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Target size={14} className="text-emerald-400" />
                              <span className="text-sm font-medium text-white">Meta da reserva</span>
                            </div>
                            <span className="text-xs font-semibold text-emerald-400 tabular-nums">
                              {Math.min(progressoMeta, 100).toFixed(1)}%
                            </span>
                          </div>
                          <BarraProgresso pct={progressoMeta} cor="#10B981" />
                          <div className="flex items-center justify-between mt-2 text-xs">
                            <span className="text-slate-400">
                              {ocultarValor(formatarMoeda(saldoAtual))} de {ocultarValor(formatarMoeda(reserva.valor_meta))}
                            </span>
                            <span className="text-slate-500">
                              Falta {ocultarValor(formatarMoeda(faltaMeta))}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-4">
                        <button
                          onClick={() => setMovimentoReserva({ reserva, tipo: 'deposito' })}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-600/25 transition-all flex items-center gap-1.5"
                        >
                          <ArrowDownCircle size={14} /> Deposito
                        </button>
                        <button
                          onClick={() => setMovimentoReserva({ reserva, tipo: 'retirada' })}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-red-600/10 border border-red-500/20 text-red-300 hover:bg-red-600/20 transition-all flex items-center gap-1.5"
                        >
                          <ArrowUpCircle size={14} /> Retirada
                        </button>
                        <button
                          onClick={() => { setReservaEditar(reserva); setModalReservaAberto(true); }}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => handleExcluirReserva(reserva.id)}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-400 hover:text-red-300 hover:border-red-500/20 transition-all flex items-center gap-1.5"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Wallet size={14} className="text-slate-500" />
                          <span className="text-xs font-medium text-slate-400">Historico de depositos e retiradas</span>
                        </div>

                        {reserva.historico.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-600">
                            Nenhum movimento ainda.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {reserva.historico.slice(0, 5).map((movimento) => (
                              <div key={movimento.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${movimento.tipo === 'deposito' ? 'bg-emerald-500/12 text-emerald-400' : 'bg-red-500/12 text-red-400'}`}>
                                  {movimento.tipo === 'deposito' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-white">
                                      {movimento.tipo === 'deposito' ? 'Deposito' : 'Retirada'}
                                    </span>
                                    <span className={`text-sm font-semibold tabular-nums ${movimento.tipo === 'deposito' ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {movimento.tipo === 'deposito' ? '+' : '-'}{formatarMoeda(movimento.valor)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 mt-0.5">
                                    <span className="truncate">{movimento.descricao || 'Sem descricao'}</span>
                                    <span>{new Date(`${movimento.data}T00:00:00`).toLocaleDateString('pt-BR')}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {cartoes.length > 0 && (
        <section className="glass-card p-5" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">💳</span>
              <span className="text-sm font-semibold text-slate-200">Cartoes (debito)</span>
            </div>
            <span className="text-sm font-bold text-red-400 tabular-nums">
              -{ocultarValor(formatarMoeda(totais.faturaCartoes))}
            </span>
          </div>
          <div className="space-y-3">
            {cartoes.map((cartao) => {
              const info = BANCO_INFO[cartao.banco] || BANCO_INFO.outro;
              const pct = totais.faturaCartoes > 0 ? (cartao.fatura_atual / totais.faturaCartoes) * 100 : 0;
              return (
                <div key={cartao.id}>
                  <div className="flex items-center gap-3">
                    <BankLogo banco={cartao.banco} size={32} className="h-8 w-8 object-contain flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{cartao.nome}</span>
                        <span className="text-sm font-semibold text-red-400 tabular-nums">-{ocultarValor(formatarMoeda(cartao.fatura_atual))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{info.nome} · {cartao.bandeira}</span>
                        <span className="text-xs text-slate-600">{pct.toFixed(1)}% do debito</span>
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
            <p className="text-xs mt-1 text-slate-700">Adicione imoveis, veiculos e outros bens.</p>
            <button
              onClick={() => { setItemEditar(undefined); setModalAberto(true); }}
              className="mt-3 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 mx-auto"
            >
              <Plus size={12} /> Adicionar ativo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {itensManual.map((item) => {
              const grupoInfo = GRUPO_INFO[item.grupo];
              const pct = totais.totalAtivos > 0 ? (item.valor / totais.totalAtivos) * 100 : 0;
              return (
                <div key={item.id}>
                  <div className="flex items-center gap-3 group">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: `${grupoInfo.cor}22` }}
                    >
                      {item.icone}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{item.nome}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white tabular-nums">{ocultarValor(formatarMoeda(item.valor))}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setItemEditar(item); setModalAberto(true); }} className="p-1 text-slate-500 hover:text-purple-400 rounded">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleExcluirManual(item.id)} className="p-1 text-slate-500 hover:text-red-400 rounded">
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

      <section className="glass-card p-5" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Resumo</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">🏦 Contas bancarias</span>
            <span className="text-emerald-400 tabular-nums">{ocultarValor(formatarMoeda(totais.saldoContas))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">🛟 Reservas</span>
            <span className="text-emerald-400 tabular-nums">{ocultarValor(formatarMoeda(totais.totalReservas))}</span>
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
            <span className="text-sm font-bold text-white">Total liquido</span>
            <span className={`text-base font-bold tabular-nums ${totais.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ocultarValor(formatarMoeda(totais.liquido))}
            </span>
          </div>
        </div>

        {selicAtual !== null && reservas.length > 0 && (
          <div className="mt-4 rounded-2xl p-4 border border-emerald-500/15 bg-emerald-500/8">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-emerald-400" />
              <span className="text-sm font-medium text-white">Leitura rapida das reservas</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Com Selic em <span className="text-emerald-400 font-semibold">{selicAtual.toFixed(2)}%</span>,
              suas reservas projetam aproximadamente <span className="text-white font-semibold">{
                ocultarValor(formatarMoeda(
                  reservas.reduce((soma, reserva) => {
                    const taxa = calcularTaxaAnualReserva(reserva.percentual_selic, selicAtual);
                    if (taxa === null) return soma;
                    return soma + (calcularSaldoReserva(reserva) * calcularTaxaMensal(taxa));
                  }, 0),
                ))
              }</span> por mes em rendimento estimado.
            </p>
          </div>
        )}
      </section>

      {modalAberto && (
        <ModalItemManual
          item={itemEditar}
          onSalvar={handleSalvarManual}
          onFechar={() => { setModalAberto(false); setItemEditar(undefined); }}
        />
      )}

      {modalReservaAberto && (
        <ModalReserva
          reserva={reservaEditar}
          onSalvar={handleSalvarReserva}
          onFechar={() => { setModalReservaAberto(false); setReservaEditar(undefined); }}
        />
      )}

      {movimentoReserva && (
        <ModalMovimentoReserva
          reserva={movimentoReserva.reserva}
          tipoInicial={movimentoReserva.tipo}
          onSalvar={handleSalvarMovimentoReserva}
          onFechar={() => setMovimentoReserva(null)}
        />
      )}
    </div>
  );
}
