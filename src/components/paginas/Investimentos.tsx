'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, Calculator, RefreshCw, Info, X, ShieldCheck } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { formatFinancialDate } from '@/lib/date';
import { TipoInvestimento } from '@/types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ── Segurança: 1 (vermelho) → 10 (verde) ──────────────────
function corSeguranca(nivel: number): string {
  if (nivel >= 9) return '#10B981';
  if (nivel >= 7) return '#22C55E';
  if (nivel >= 5) return '#F59E0B';
  if (nivel >= 3) return '#F97316';
  return '#EF4444';
}

function labelSeguranca(nivel: number): string {
  if (nivel >= 9) return 'Muito Alto';
  if (nivel >= 7) return 'Alto';
  if (nivel >= 5) return 'Médio';
  if (nivel >= 3) return 'Baixo';
  return 'Muito Baixo';
}

// ── Tipos de investimento com segurança e descrição completa ─
const TIPOS_INV: {
  valor: TipoInvestimento;
  label: string;
  icone: string;
  descricao: string;
  seguranca: number;
  infoDetalhada: string;
  rentabilidadeEsperada: string;
  liquidez: string;
  ir: string;
  garantia: string;
  indicado: string;
}[] = [
  {
    valor: 'tesouro_selic',
    label: 'Tesouro Selic',
    icone: '🏛️',
    descricao: '100% Selic — liquidez diária',
    seguranca: 10,
    infoDetalhada: 'Título de dívida pública emitido pelo Tesouro Nacional. A rentabilidade acompanha a taxa Selic do dia a dia, sendo atualizada diariamente. É a aplicação mais segura do Brasil — garantida pelo Governo Federal. Resgate disponível em D+1 útil.',
    rentabilidadeEsperada: '100% da Selic (atual ~10,75% a.a.)',
    liquidez: 'Diária (D+1)',
    ir: 'Tabela regressiva: 22,5% (<6m) → 15% (>2a)',
    garantia: 'Governo Federal',
    indicado: 'Reserva de emergência, curto e médio prazo',
  },
  {
    valor: 'tesouro_ipca',
    label: 'Tesouro IPCA+',
    icone: '📊',
    descricao: 'IPCA + taxa fixa',
    seguranca: 9,
    infoDetalhada: 'Protege o poder de compra contra a inflação. Paga IPCA (inflação oficial) + uma taxa fixa pré-definida no momento da compra. Se vendido antes do vencimento, o valor pode ser menor que o aplicado (marcação a mercado). Ideal para longo prazo.',
    rentabilidadeEsperada: 'IPCA + 5% a 7% a.a. dependendo do prazo',
    liquidez: 'Diária (com risco de marcação a mercado)',
    ir: 'Tabela regressiva: 22,5% (<6m) → 15% (>2a)',
    garantia: 'Governo Federal',
    indicado: 'Aposentadoria, objetivos de longo prazo (+5 anos)',
  },
  {
    valor: 'tesouro_prefixado',
    label: 'Tesouro Prefixado',
    icone: '📋',
    descricao: 'Taxa fixa pré-acordada',
    seguranca: 8,
    infoDetalhada: 'Taxa de retorno definida no momento da compra. Você já sabe exatamente quanto vai receber no vencimento. Se vendido antes do vencimento, o valor pode variar (marcação a mercado). Ideal quando Selic está alta e você quer travar a taxa.',
    rentabilidadeEsperada: 'Taxa prefixada de ~11% a 13% a.a.',
    liquidez: 'Diária (com risco de marcação a mercado)',
    ir: 'Tabela regressiva: 22,5% (<6m) → 15% (>2a)',
    garantia: 'Governo Federal',
    indicado: 'Quem quer travar rentabilidade futura',
  },
  {
    valor: 'cdb',
    label: 'CDB',
    icone: '🏦',
    descricao: '% do CDI (até 120% CDI)',
    seguranca: 7,
    infoDetalhada: 'Certificado de Depósito Bancário — empréstimo que você faz ao banco em troca de juros. Protegido pelo FGC (Fundo Garantidor de Créditos) até R$ 250.000 por CPF por instituição. Rende % do CDI, geralmente de 90% a 120% CDI dependendo do banco e prazo.',
    rentabilidadeEsperada: '90% a 120% do CDI (~10% a 12,8% a.a.)',
    liquidez: 'Varia: diária (liquidez D+1) ou no vencimento',
    ir: 'Tabela regressiva: 22,5% (<6m) → 15% (>2a)',
    garantia: 'FGC até R$ 250.000 por CPF/instituição',
    indicado: 'Médio prazo, reserva de oportunidade',
  },
  {
    valor: 'lci_lca',
    label: 'LCI / LCA',
    icone: '🌱',
    descricao: 'Isento IR — % do CDI',
    seguranca: 8,
    infoDetalhada: 'Letras de Crédito Imobiliário (LCI) e do Agronegócio (LCA). São isentas de Imposto de Renda para pessoa física, o que aumenta o retorno líquido. Protegidas pelo FGC. Normalmente exigem carência mínima (90 dias). Rende % do CDI, geralmente 80% a 95%.',
    rentabilidadeEsperada: '80% a 95% CDI líquido (~8,5% a 10,1% a.a.)',
    liquidez: 'Carência mínima de 90 dias',
    ir: 'ISENTO para pessoa física',
    garantia: 'FGC até R$ 250.000 por CPF/instituição',
    indicado: 'Médio prazo, equivale ou supera CDB após IR',
  },
  {
    valor: 'fundos_di',
    label: 'Fundo DI',
    icone: '💼',
    descricao: '100% CDI (menos taxa adm.)',
    seguranca: 6,
    infoDetalhada: 'Fundo de investimento que aplica em títulos públicos e privados de curto prazo, atrelados ao CDI. Praticidade de gestão automática, mas cobra taxa de administração que reduz o rendimento. Sem FGC — mas regulado pela CVM. Resgate geralmente no mesmo dia ou D+1.',
    rentabilidadeEsperada: 'CDI menos taxa adm. (~9,5% a 10,3% a.a.)',
    liquidez: 'D+0 ou D+1',
    ir: 'Tabela regressiva + come-cotas (maio e nov)',
    garantia: 'Regulado pela CVM, sem FGC',
    indicado: 'Quem quer praticidade e liquidez imediata',
  },
  {
    valor: 'poupanca',
    label: 'Poupança',
    icone: '🐷',
    descricao: '70% Selic (isenta IR)',
    seguranca: 9,
    infoDetalhada: 'A aplicação mais tradicional do Brasil. Quando Selic > 8,5% a.a., rende 0,5% ao mês + TR. Quando Selic ≤ 8,5%, rende 70% da Selic. Totalmente isenta de IR. Alta liquidez. Porém, com Selic elevada, rende bem menos que outros investimentos de renda fixa.',
    rentabilidadeEsperada: '70% da Selic (~7,5% a.a.) isento de IR',
    liquidez: 'Imediata (sem liquidez diária — aniversário da data)',
    ir: 'ISENTO para pessoa física',
    garantia: 'FGC até R$ 250.000 por CPF/instituição',
    indicado: 'Curtíssimo prazo, mas há opções melhores',
  },
  {
    valor: 'acoes',
    label: 'Ações / FII',
    icone: '📈',
    descricao: 'Renda variável',
    seguranca: 3,
    infoDetalhada: 'Participação em empresas (ações) ou fundos imobiliários (FII) listados na B3. Não há garantia de retorno — o valor pode subir ou cair. Historicamente, o mercado acionário brasileiro (Ibovespa) rendeu em média 12-15% a.a. no longo prazo, superando a renda fixa. Exige mais conhecimento e tolerância ao risco.',
    rentabilidadeEsperada: 'Variável — histórico Ibovespa: ~12-15% a.a.',
    liquidez: 'Diária (mercado aberto em dias úteis)',
    ir: 'Ganho capital: 15% (swing) / 20% (day trade). Dividendos: isentos',
    garantia: 'Nenhuma — renda variável',
    indicado: 'Longo prazo (+5 anos), perfil moderado/arrojado',
  },
  {
    valor: 'cripto',
    label: 'Cripto',
    icone: '₿',
    descricao: 'Renda variável — alta volatilidade',
    seguranca: 1,
    infoDetalhada: 'Criptomoedas como Bitcoin, Ethereum e outras são ativos digitais descentralizados. Extrema volatilidade — pode valorizar 100% ou cair 80% em meses. Sem regulação do Banco Central e sem garantia do FGC. Alto potencial de retorno acompanha risco muito elevado. Apenas para quem entende o ativo e aceita perder o capital.',
    rentabilidadeEsperada: 'Extremamente variável (-80% a +500%)',
    liquidez: 'Depende da exchange (geralmente imediata)',
    ir: '15% sobre ganho de capital por venda',
    garantia: 'NENHUMA',
    indicado: 'Perfil arrojado, máximo 5% do patrimônio',
  },
  {
    valor: 'outro',
    label: 'Outro',
    icone: '💰',
    descricao: 'Personalizado',
    seguranca: 5,
    infoDetalhada: 'Investimento personalizado ou não listado nas categorias padrão. Pode incluir: previdência privada, debêntures, COE, ouro, fundos de investimento em participações, entre outros. Avalie os riscos, garantias e liquidez individualmente antes de aplicar.',
    rentabilidadeEsperada: 'Varia conforme o ativo',
    liquidez: 'Varia conforme o ativo',
    ir: 'Varia conforme o ativo',
    garantia: 'Varia conforme o ativo',
    indicado: 'Depende do ativo específico',
  },
];

// ── Ações e FIIs brasileiros populares ────────────────────
const ATIVOS_B3 = [
  // Bancos
  { ticker: 'ITUB4', nome: 'Itaú Unibanco', setor: 'Bancos', tipo: 'Ação', dy: 5.2, seguranca: 7, descricao: 'Maior banco privado do Brasil por ativos. Alta diversificação, forte dividend yield e presença na América Latina.', variacao12m: 18.3 },
  { ticker: 'BBDC4', nome: 'Bradesco', setor: 'Bancos', tipo: 'Ação', dy: 6.1, seguranca: 6, descricao: 'Segundo maior banco privado do Brasil. Dividend yield histórico elevado e ampla rede de agências.', variacao12m: 8.7 },
  { ticker: 'BBAS3', nome: 'Banco do Brasil', setor: 'Bancos', tipo: 'Ação', dy: 8.3, seguranca: 7, descricao: 'Maior banco da América Latina por total de ativos. Controle estatal parcial e dividend yield acima da média.', variacao12m: 22.1 },
  { ticker: 'SANB11', nome: 'Santander Brasil', setor: 'Bancos', tipo: 'Ação', dy: 5.8, seguranca: 6, descricao: 'Subsidiária brasileira do banco espanhol Santander. Foco em varejo e PMEs.', variacao12m: 5.4 },
  // Energia
  { ticker: 'CMIG4', nome: 'Cemig', setor: 'Energia', tipo: 'Ação', dy: 10.2, seguranca: 6, descricao: 'Distribuidora, transmissora e geradora de energia de Minas Gerais. Dividend yield elevado historicamente.', variacao12m: 15.6 },
  { ticker: 'CPFE3', nome: 'CPFL Energia', setor: 'Energia', tipo: 'Ação', dy: 7.5, seguranca: 7, descricao: 'Uma das maiores geradoras e distribuidoras de energia do Brasil. Estável e previsível.', variacao12m: 12.8 },
  { ticker: 'ENEV3', nome: 'Eneva', setor: 'Energia', tipo: 'Ação', dy: 2.1, seguranca: 5, descricao: 'Empresa de geração de energia termelétrica com foco em gás natural. Alta capacidade instalada.', variacao12m: 28.4 },
  // Commodities
  { ticker: 'PETR4', nome: 'Petrobras', setor: 'Petróleo', tipo: 'Ação', dy: 12.5, seguranca: 5, descricao: 'Maior empresa do Brasil e uma das maiores petrolíferas do mundo. Dividend yield extraordinário mas sujeito a política de dividendos variável.', variacao12m: 35.2 },
  { ticker: 'VALE3', nome: 'Vale', setor: 'Mineração', tipo: 'Ação', dy: 8.7, seguranca: 5, descricao: 'Maior produtora de minério de ferro e níquel do mundo. Resultados atrelados às commodities internacionais.', variacao12m: -8.3 },
  { ticker: 'PRIO3', nome: 'Prio (PetroRio)', setor: 'Petróleo', tipo: 'Ação', dy: 1.2, seguranca: 4, descricao: 'Empresa independente de exploração e produção de petróleo. Alto crescimento de produção.', variacao12m: 42.7 },
  // Indústria/Tech
  { ticker: 'WEGE3', nome: 'WEG', setor: 'Indústria', tipo: 'Ação', dy: 1.5, seguranca: 7, descricao: 'Fabricante de motores elétricos e soluções de automação. Exportadora com presença em 135 países. Crescimento consistente.', variacao12m: 24.1 },
  { ticker: 'RENT3', nome: 'Localiza', setor: 'Serviços', tipo: 'Ação', dy: 1.1, seguranca: 6, descricao: 'Maior empresa de aluguel de carros da América Latina. Modelo de negócio resiliente com alta recorrência.', variacao12m: 19.8 },
  // FIIs
  { ticker: 'MXRF11', nome: 'Maxi Renda', setor: 'FII Papel', tipo: 'FII', dy: 12.8, seguranca: 5, descricao: 'Fundo de papel (CRIs) com diversificação em ativos de crédito imobiliário. Distribuição mensal de proventos.', variacao12m: 6.2 },
  { ticker: 'HGLG11', nome: 'CSHG Logística', setor: 'FII Logístico', tipo: 'FII', dy: 7.2, seguranca: 7, descricao: 'Fundo de galpões logísticos com inquilinos de alta qualidade. Contratos longos e baixa vacância.', variacao12m: 11.4 },
  { ticker: 'XPML11', nome: 'XP Malls', setor: 'FII Shopping', tipo: 'FII', dy: 8.4, seguranca: 6, descricao: 'Fundo de shoppings centers com ativos premium em São Paulo. Boa gestão e ativo valorizado.', variacao12m: 13.7 },
  { ticker: 'KNRI11', nome: 'Kinea Renda', setor: 'FII Misto', tipo: 'FII', dy: 7.8, seguranca: 7, descricao: 'Fundo misto com lajes corporativas e galpões logísticos. Diversificação de risco e inquilinos sólidos.', variacao12m: 9.3 },
  { ticker: 'VILG11', nome: 'Vinci Logística', setor: 'FII Logístico', tipo: 'FII', dy: 8.1, seguranca: 7, descricao: 'Fundo especializado em galpões logísticos e industriais. Contratos atypicals e inquilinos blue chips.', variacao12m: 10.8 },
  { ticker: 'HCTR11', nome: 'Hectare', setor: 'FII Papel', tipo: 'FII', dy: 14.2, seguranca: 4, descricao: 'Fundo de papel com foco em CRIs de maior risco e maior retorno. DY elevado com risco maior.', variacao12m: -2.1 },
];

const SETORES_UNICOS = [...new Set(ATIVOS_B3.map(a => a.setor))];

// ── Tabela IR ──────────────────────────────────────────────
function calcularIR(rendimento: number, meses: number): number {
  if (meses <= 6)  return rendimento * 0.225;
  if (meses <= 12) return rendimento * 0.20;
  if (meses <= 24) return rendimento * 0.175;
  return rendimento * 0.15;
}

function gerarCenarios(
  principal: number,
  aporteMensal: number,
  meses: number,
  taxas: { selic: number; cdi: number; ipca: number }
) {
  const { selic, cdi, ipca } = taxas;
  const cenarios = [
    { nome: 'Poupança',        taxa: selic * 0.7,   cor: '#94A3B8', isentoIR: true  },
    { nome: 'Tesouro Selic',   taxa: selic,          cor: '#3B82F6', isentoIR: false },
    { nome: 'CDB 100% CDI',    taxa: cdi,            cor: '#7C3AED', isentoIR: false },
    { nome: 'CDB 110% CDI',    taxa: cdi * 1.1,      cor: '#8B5CF6', isentoIR: false },
    { nome: 'LCI 90% CDI',     taxa: cdi * 0.9,      cor: '#10B981', isentoIR: true  },
    { nome: 'LCI 95% CDI',     taxa: cdi * 0.95,     cor: '#059669', isentoIR: true  },
    { nome: 'Tesouro IPCA+6%', taxa: ipca + 6,       cor: '#F59E0B', isentoIR: false },
    { nome: 'CDB 120% CDI',    taxa: cdi * 1.2,      cor: '#A78BFA', isentoIR: false },
  ];

  return cenarios.map(c => {
    const taxaMes  = Math.pow(1 + c.taxa / 100, 1 / 12) - 1;
    let total      = principal;
    let totalAport = 0;
    for (let m = 0; m < meses; m++) {
      total       = total * (1 + taxaMes) + aporteMensal;
      totalAport += aporteMensal;
    }
    const totalInvest     = principal + totalAport;
    const rendimentoBruto = total - totalInvest;
    const ir              = c.isentoIR ? 0 : calcularIR(rendimentoBruto, meses);
    const rendLiquido     = rendimentoBruto - ir;
    const totalLiquido    = totalInvest + rendLiquido;
    return { ...c, totalInvest, rendimentoBruto, ir, rendLiquido, totalLiquido };
  }).sort((a, b) => b.totalLiquido - a.totalLiquido);
}

// ══════════════════════════════════════════════════════════
export default function Investimentos() {
  const { investimentos, adicionarInvestimento, excluirInvestimento, selicAtual, cdiAtual, ipcaAtual, setTaxas } = useFinanceiroStore();

  const [aba, setAba]                 = useState<'simulador' | 'carteira' | 'acoes'>('simulador');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [buscando, setBuscando]       = useState(false);
  const [infoTipo, setInfoTipo]       = useState<typeof TIPOS_INV[0] | null>(null);

  // Simulador
  const [simPrincipal, setSimPrincipal]   = useState('1000');
  const [simAporte, setSimAporte]         = useState('200');
  const [simMeses, setSimMeses]           = useState(12);
  const [simAnos, setSimAnos]             = useState(false);
  const [simCustom, setSimCustom]         = useState('');
  const [modoCustom, setModoCustom]       = useState(false);

  // Ações
  const [filtroSetor, setFiltroSetor]     = useState('Todos');
  const [filtroTipo, setFiltroTipo]       = useState('Todos');
  const [ordenarPor, setOrdenarPor]       = useState<'dy' | 'seguranca' | 'variacao12m'>('dy');

  // Formulário
    const [form, setForm] = useState({
      nome: '', tipo: 'cdb' as TipoInvestimento,
      valor_investido: '', data_inicio: formatFinancialDate(new Date()),
      banco: '', taxa_rendimento: '', indice: 'cdi' as 'prefixado' | 'cdi' | 'selic' | 'ipca' | 'poupanca',
      isento_ir: false,
  });

  async function buscarTaxas() {
    setBuscando(true);
    try {
      const res  = await fetch('/api/selic');
      const data = await res.json();
      const selic = data.taxa || 10.75;
      setTaxas(selic, selic - 0.1, 4.83);
    } catch { /* fallback */ }
    finally { setBuscando(false); }
  }

  useEffect(() => {
    if (selicAtual) return;
    const timeout = window.setTimeout(() => {
      buscarTaxas();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [buscarTaxas, selicAtual]);

  const taxas = useMemo(() => ({
    selic: selicAtual || 10.75,
    cdi: cdiAtual || 10.65,
    ipca: ipcaAtual || 4.83,
  }), [selicAtual, cdiAtual, ipcaAtual]);

  const prazoMeses = useMemo(() => {
    if (modoCustom) {
      const v = parseInt(simCustom);
      return isNaN(v) || v < 1 ? 1 : simAnos ? v * 12 : v;
    }
    return simAnos ? simMeses * 12 : simMeses;
  }, [modoCustom, simCustom, simMeses, simAnos]);

  const cenarios = useMemo(() => {
    const principal = parseFloat(simPrincipal) || 0;
    const aporte    = parseFloat(simAporte)    || 0;
    if (principal <= 0) return [];
    return gerarCenarios(principal, aporte, prazoMeses, taxas);
  }, [simPrincipal, simAporte, prazoMeses, taxas]);

  const projecaoGrafico = useMemo(() => {
    const principal = parseFloat(simPrincipal) || 0;
    const aporte    = parseFloat(simAporte)    || 0;
    if (principal <= 0 || prazoMeses < 1) return [];
    const top3 = cenarios.slice(0, 3);
    return Array.from({ length: Math.min(prazoMeses, 60) }, (_, i) => {
      const m = i + 1;
      const entry: Record<string, number | string> = {
        periodo: m <= 12 ? `${m}m` : `${Math.floor(m/12)}a${m%12 ? m%12+'m' : ''}`,
      };
      top3.forEach(c => {
        const taxaMes = Math.pow(1 + c.taxa / 100, 1 / 12) - 1;
        let total = principal;
        for (let k = 0; k < m; k++) total = total * (1 + taxaMes) + aporte;
        entry[c.nome] = Math.round(total);
      });
      return entry;
    }).filter((_, i) => {
      if (prazoMeses <= 12) return true;
      if (prazoMeses <= 24) return true;
      return i % 3 === 0 || i === Math.min(prazoMeses, 60) - 1;
    });
  }, [cenarios, simPrincipal, simAporte, prazoMeses]);

  const totalCarteira = investimentos.reduce((s, i) => s + i.valor_investido, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    adicionarInvestimento({
      nome: form.nome, tipo: form.tipo,
      valor_investido: parseFloat(form.valor_investido) || 0,
      data_inicio: form.data_inicio,
      banco: form.banco || undefined,
      taxa_rendimento: parseFloat(form.taxa_rendimento) || undefined,
      indice: form.indice, isento_ir: form.isento_ir,
    });
    setForm({ nome:'', tipo:'cdb', valor_investido:'', data_inicio: formatFinancialDate(new Date()), banco:'', taxa_rendimento:'', indice:'cdi', isento_ir:false });
    setMostrarForm(false);
  }

  const ativosB3Filtrados = useMemo(() => {
    let lista = ATIVOS_B3;
    if (filtroSetor !== 'Todos') lista = lista.filter(a => a.setor === filtroSetor);
    if (filtroTipo !== 'Todos')  lista = lista.filter(a => a.tipo === filtroTipo);
    return [...lista].sort((a, b) => {
      if (ordenarPor === 'dy')          return b.dy - a.dy;
      if (ordenarPor === 'seguranca')   return b.seguranca - a.seguranca;
      if (ordenarPor === 'variacao12m') return b.variacao12m - a.variacao12m;
      return 0;
    });
  }, [filtroSetor, filtroTipo, ordenarPor]);

  const MESES_OPCOES = [1, 3, 6, 12, 18, 24, 36, 48, 60];
  const ANOS_OPCOES  = [1, 2, 3, 5, 10, 15, 20, 30];

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Investimentos</h2>
          <p className="text-slate-500 text-sm">
            Selic: <span className="text-purple-400 font-semibold">{taxas.selic.toFixed(2)}%</span>
            {' '}• CDI: <span className="text-purple-400 font-semibold">{taxas.cdi.toFixed(2)}%</span>
            {' '}• IPCA: <span className="text-purple-400 font-semibold">{taxas.ipca.toFixed(2)}%</span>
            <button onClick={buscarTaxas} disabled={buscando} className="ml-2 text-slate-600 hover:text-purple-400 transition-colors">
              <RefreshCw size={12} className={buscando ? 'animate-spin inline' : 'inline'} />
            </button>
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex bg-white/[0.04] rounded-xl p-1 gap-1">
        {([
          { id: 'simulador', label: '🧮 Simulador' },
          { id: 'carteira',  label: '📊 Carteira' },
          { id: 'acoes',     label: '📈 Ações/FII' },
        ] as const).map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              aba === a.id ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── SIMULADOR ─────────────────────────────────────── */}
      {aba === 'simulador' && (
        <div className="space-y-5">
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Calculator size={15} className="text-purple-400" /> Configurar Simulação
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Valor Inicial (R$)</label>
                <input type="number" min="0" step="100"
                  value={simPrincipal} onChange={e => setSimPrincipal(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white text-base font-semibold rounded-xl px-3 py-3 outline-none focus:border-purple-500 tabular-nums" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Aporte Mensal (R$)</label>
                <input type="number" min="0" step="50"
                  value={simAporte} onChange={e => setSimAporte(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white text-base font-semibold rounded-xl px-3 py-3 outline-none focus:border-purple-500 tabular-nums" />
              </div>
            </div>

            {/* Prazo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Prazo</label>
                <div className="flex gap-1">
                  <div className="flex bg-white/5 rounded-lg p-0.5">
                    <button onClick={() => { setSimAnos(false); setModoCustom(false); }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${!simAnos && !modoCustom ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                      Meses
                    </button>
                    <button onClick={() => { setSimAnos(true); setModoCustom(false); }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${simAnos && !modoCustom ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                      Anos
                    </button>
                    <button onClick={() => setModoCustom(true)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${modoCustom ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                      Custom
                    </button>
                  </div>
                </div>
              </div>

              {modoCustom ? (
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="600" placeholder="Ex: 18"
                    value={simCustom} onChange={e => setSimCustom(e.target.value)}
                    className="w-32 bg-white/5 border border-purple-500/50 text-white text-base font-semibold rounded-xl px-3 py-2.5 outline-none focus:border-purple-500 tabular-nums" />
                  <div className="flex bg-white/5 rounded-lg p-0.5">
                    <button onClick={() => setSimAnos(false)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!simAnos ? 'bg-purple-600/60 text-white' : 'text-slate-400'}`}>meses</button>
                    <button onClick={() => setSimAnos(true)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${simAnos ? 'bg-purple-600/60 text-white' : 'text-slate-400'}`}>anos</button>
                  </div>
                  <span className="text-xs text-slate-500">= {prazoMeses} meses</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(simAnos ? ANOS_OPCOES : MESES_OPCOES).map(v => (
                    <button key={v} onClick={() => setSimMeses(v)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                        simMeses === v ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}>
                      {v}{simAnos ? 'a' : 'm'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {parseFloat(simPrincipal) > 0 && (
              <div className="bg-purple-950/30 border border-purple-800/30 rounded-xl p-3 text-xs text-slate-400">
                Total investido: <span className="text-white font-semibold tabular-nums">
                  {formatarMoeda(parseFloat(simPrincipal) + parseFloat(simAporte || '0') * prazoMeses)}
                </span>{' '}em{' '}
                <span className="text-white font-semibold">
                  {prazoMeses >= 12
                    ? `${Math.floor(prazoMeses/12)}a${prazoMeses%12 ? ` ${prazoMeses%12}m` : ''}`
                    : `${prazoMeses} mes${prazoMeses > 1 ? 'es' : ''}`}
                </span>
              </div>
            )}
          </div>

          {/* Tabela comparativa */}
          {cenarios.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/[0.05]">
                <h3 className="text-sm font-semibold text-slate-300">Comparativo de Investimentos</h3>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Info size={11} /> Valores líquidos após IR. LCI/LCA isentos de IR.
                </p>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {cenarios.map((c, i) => (
                  <div key={c.nome}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] ${i === 0 ? 'bg-purple-950/20' : ''}`}>
                    <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: c.cor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{c.nome}</span>
                        {i === 0 && <span className="text-[10px] bg-purple-600/40 text-purple-300 px-2 py-0.5 rounded-full font-medium">Melhor</span>}
                        {c.isentoIR && <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Isento IR</span>}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Taxa: {c.taxa.toFixed(2)}% a.a.{c.ir > 0 && ` • IR: ${formatarMoeda(c.ir)}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-white tabular-nums">{formatarMoeda(c.totalLiquido)}</div>
                      <div className="text-xs text-emerald-400 tabular-nums">+{formatarMoeda(c.rendLiquido)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gráfico */}
          {projecaoGrafico.length > 1 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Projeção — Top 3</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={projecaoGrafico} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    {cenarios.slice(0, 3).map((c, i) => (
                      <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.cor} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={c.cor} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fill:'#64748B', fontSize:10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill:'#64748B', fontSize:10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(v) => [formatarMoeda(Number(v)), '']}
                    contentStyle={{ background:'#0E1220', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', color:'#F1F5F9', fontSize:12 }} />
                  {cenarios.slice(0, 3).map((c, i) => (
                    <Area key={i} type="monotone" dataKey={c.nome}
                      stroke={c.cor} strokeWidth={2} fill={`url(#grad${i})`} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {cenarios.slice(0, 3).map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-3 h-[2px] rounded inline-block" style={{ background: c.cor }} />
                    {c.nome}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CARTEIRA ──────────────────────────────────────── */}
      {aba === 'carteira' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Total Investido</div>
            <div className="text-3xl font-bold text-white tabular-nums">{formatarMoeda(totalCarteira)}</div>
            {selicAtual && totalCarteira > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Rendimento estimado/mês (Selic): <span className="text-emerald-400 font-semibold">
                  {formatarMoeda(totalCarteira * selicAtual / 100 / 12)}
                </span>
              </div>
            )}
          </div>

          <button onClick={() => setMostrarForm(v => !v)}
            className="btn-primary w-full flex items-center justify-center gap-2 text-white px-4 py-3 rounded-xl text-sm font-semibold">
            <Plus size={16} /> Adicionar Investimento
          </button>

          {mostrarForm && (
            <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4 border-purple-500/30">
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Tipo de Investimento</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_INV.map(t => {
                    const ativo = form.tipo === t.valor;
                    return (
                      <div key={t.valor} className="relative">
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, tipo: t.valor }))}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
                            ativo ? 'border-purple-500 bg-purple-600/20 text-purple-300' : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:border-white/15'
                          }`}>
                          <div className="font-semibold mb-1">{t.icone} {t.label}</div>
                          {/* Nível de segurança */}
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 10 }, (_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: i < t.seguranca ? corSeguranca(t.seguranca) : 'rgba(255,255,255,0.1)' }} />
                              ))}
                            </div>
                            <span className="text-[10px]" style={{ color: corSeguranca(t.seguranca) }}>
                              {t.seguranca}/10
                            </span>
                          </div>
                          <div className="text-[10px] opacity-70">{t.descricao}</div>
                        </button>
                        {/* Botão info */}
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setInfoTipo(t); }}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                          title="Saiba mais">
                          <Info size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome / Descrição *</label>
                <input type="text" required placeholder="Ex: CDB Nubank 110% CDI"
                  value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valor (R$) *</label>
                  <input type="number" required min="0" step="0.01"
                    value={form.valor_investido} onChange={e => setForm(f => ({ ...f, valor_investido: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Taxa (% a.a.)</label>
                  <input type="number" step="0.01"
                    value={form.taxa_rendimento} onChange={e => setForm(f => ({ ...f, taxa_rendimento: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Banco/Corretora</label>
                  <input type="text" placeholder="Ex: Nubank, XP..."
                    value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Data Início</label>
                  <input type="date"
                    value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.isento_ir}
                  onChange={e => setForm(f => ({ ...f, isento_ir: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 accent-purple-500" />
                Isento de IR (LCI, LCA, Poupança)
              </label>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">Salvar</button>
                <button type="button" onClick={() => setMostrarForm(false)}
                  className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors">Cancelar</button>
              </div>
            </form>
          )}

          {investimentos.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-slate-600">
              <TrendingUp size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">Nenhum investimento cadastrado</p>
              <p className="text-xs mt-1">Use o simulador para comparar antes de investir!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {investimentos.map(inv => {
                const tipo    = TIPOS_INV.find(t => t.valor === inv.tipo);
                const rendMes = inv.taxa_rendimento
                  ? inv.valor_investido * (Math.pow(1 + inv.taxa_rendimento / 100, 1/12) - 1)
                  : selicAtual ? inv.valor_investido * selicAtual / 100 / 12 : null;
                return (
                  <div key={inv.id} className="glass-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{tipo?.icone || '💰'}</div>
                        <div>
                          <div className="text-sm font-semibold text-white">{inv.nome}</div>
                          <div className="text-xs text-slate-500">
                            {tipo?.label}{inv.banco && ` • ${inv.banco}`}{inv.isento_ir && ' • Isento IR'}
                          </div>
                          {tipo && (
                            <div className="flex items-center gap-1 mt-1">
                              <div className="flex gap-0.5">
                                {Array.from({ length: 10 }, (_, i) => (
                                  <div key={i} className="w-1.5 h-1 rounded-full"
                                    style={{ background: i < tipo.seguranca ? corSeguranca(tipo.seguranca) : 'rgba(255,255,255,0.1)' }} />
                                ))}
                              </div>
                              <span className="text-[10px]" style={{ color: corSeguranca(tipo.seguranca) }}>
                                {labelSeguranca(tipo.seguranca)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {tipo && (
                          <button onClick={() => setInfoTipo(tipo)}
                            className="text-slate-600 hover:text-purple-400 p-1.5 rounded-lg transition-colors">
                            <Info size={14} />
                          </button>
                        )}
                        <button onClick={() => confirm('Excluir?') && excluirInvestimento(inv.id)}
                          className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Investido</div>
                        <div className="text-lg font-bold text-white tabular-nums">{formatarMoeda(inv.valor_investido)}</div>
                      </div>
                      {rendMes !== null && (
                        <div>
                          <div className="text-xs text-slate-500">Rend. est./mês</div>
                          <div className="text-lg font-bold text-emerald-400 tabular-nums">+{formatarMoeda(rendMes)}</div>
                        </div>
                      )}
                      {inv.taxa_rendimento && (
                        <div>
                          <div className="text-xs text-slate-500">Taxa</div>
                          <div className="text-sm font-semibold text-purple-400">{inv.taxa_rendimento}% a.a.</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AÇÕES / FII ────────────────────────────────────── */}
      {aba === 'acoes' && (
        <div className="space-y-4">
          {/* Disclaimer */}
          <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl px-4 py-3 flex gap-2">
            <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80">
              Dados históricos para referência educacional. Rentabilidade passada não garante resultados futuros.
              Consulte um assessor de investimentos antes de aplicar.
            </p>
          </div>

          {/* Filtros */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">Tipo</label>
                <div className="flex gap-1">
                  {['Todos', 'Ação', 'FII'].map(t => (
                    <button key={t} onClick={() => setFiltroTipo(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        filtroTipo === t ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">Ordenar por</label>
                <div className="flex gap-1">
                  {[
                    { id: 'dy',          label: 'Dividendos' },
                    { id: 'seguranca',   label: 'Segurança' },
                    { id: 'variacao12m', label: 'Valoriz.' },
                  ].map(o => (
                    <button key={o.id} onClick={() => setOrdenarPor(o.id as typeof ordenarPor)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        ordenarPor === o.id ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}>{o.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Setor</label>
              <div className="flex flex-wrap gap-1">
                {['Todos', ...SETORES_UNICOS].map(s => (
                  <button key={s} onClick={() => setFiltroSetor(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                      filtroSetor === s ? 'bg-purple-600/80 text-white' : 'bg-white/5 text-slate-500 hover:text-white'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Lista de ativos */}
          <div className="space-y-2">
            {ativosB3Filtrados.map(ativo => (
              <div key={ativo.ticker} className="glass-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white ${
                      ativo.tipo === 'FII' ? 'bg-emerald-700/60' : 'bg-blue-700/60'
                    }`}>
                      {ativo.ticker.slice(0, 4)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{ativo.ticker}</span>
                      <span className="text-xs text-slate-400">{ativo.nome}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                        ativo.tipo === 'FII' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-blue-900/40 text-blue-400'
                      }`}>{ativo.tipo}</span>
                      <span className="text-[10px] bg-white/5 text-slate-500 px-1.5 py-0.5 rounded-md">{ativo.setor}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{ativo.descricao}</p>

                    {/* Métricas */}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <div>
                        <span className="text-[10px] text-slate-600">DY 12m</span>
                        <span className="text-xs font-bold text-emerald-400 ml-1">{ativo.dy.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600">Variação 12m</span>
                        <span className={`text-xs font-bold ml-1 ${ativo.variacao12m >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ativo.variacao12m >= 0 ? '+' : ''}{ativo.variacao12m.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-600">Risco</span>
                        <div className="flex gap-0.5 ml-1">
                          {Array.from({ length: 10 }, (_, i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full"
                              style={{ background: i < ativo.seguranca ? corSeguranca(ativo.seguranca) : 'rgba(255,255,255,0.1)' }} />
                          ))}
                        </div>
                        <span className="text-[10px]" style={{ color: corSeguranca(ativo.seguranca) }}>{ativo.seguranca}/10</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-600 pb-4">
            Dados de referência histórica • Atualizado periodicamente
          </p>
        </div>
      )}

      {/* ── Modal Info Investimento ────────────────────────── */}
      {infoTipo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setInfoTipo(null)}>
          <div className="w-full max-w-sm bg-[#0A0E1A] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{infoTipo.icone}</span>
                <div>
                  <h3 className="text-base font-bold text-white">{infoTipo.label}</h3>
                  <p className="text-xs text-slate-500">{infoTipo.descricao}</p>
                </div>
              </div>
              <button onClick={() => setInfoTipo(null)}
                className="text-slate-500 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Nível de segurança */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 flex items-center gap-1"><ShieldCheck size={12} /> Nível de Segurança</span>
                  <span className="text-sm font-bold" style={{ color: corSeguranca(infoTipo.seguranca) }}>
                    {infoTipo.seguranca}/10 — {labelSeguranca(infoTipo.seguranca)}
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="flex-1 h-2.5 rounded-full"
                      style={{ background: i < infoTipo.seguranca ? corSeguranca(infoTipo.seguranca) : 'rgba(255,255,255,0.07)' }} />
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <p className="text-sm text-slate-300 leading-relaxed">{infoTipo.infoDetalhada}</p>

              {/* Tabela de detalhes */}
              <div className="space-y-2">
                {[
                  { label: 'Rentabilidade esperada', valor: infoTipo.rentabilidadeEsperada, icone: '📈' },
                  { label: 'Liquidez',               valor: infoTipo.liquidez,              icone: '💧' },
                  { label: 'Imposto de Renda',       valor: infoTipo.ir,                    icone: '📋' },
                  { label: 'Garantia',               valor: infoTipo.garantia,              icone: '🛡️' },
                  { label: 'Indicado para',          valor: infoTipo.indicado,              icone: '✅' },
                ].map(({ label, valor, icone }) => (
                  <div key={label} className="flex gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{icone}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-xs text-slate-200 font-medium mt-0.5">{valor}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-white/[0.05]">
              <button onClick={() => setInfoTipo(null)}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
