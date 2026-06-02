'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, FileImage, Loader2, Pencil, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import OCRModelSelect from '@/components/ui/OCRModelSelect';
import { formatarMoeda, gerarId, storageSalarios } from '@/lib/storage';
import type { ContrachequeRegistro, PerfilSalarial, RubricaContracheque } from '@/types';

type AnaliseContracheque = {
  nome_perfil_sugerido: string;
  referencia: string;
  orgao?: string;
  lotacao?: string;
  cargo?: string;
  tipo_contrato?: string;
  situacao_funcional?: string;
  cpf?: string;
  matricula?: string;
  contrato?: string;
  tipo_folha?: string;
  classe?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  salario_base?: number;
  total_bruto?: number;
  total_descontos?: number;
  total_liquido?: number;
  rubricas: RubricaContracheque[];
  observacoes?: string;
  texto_extraido?: string;
  arquivo_nome?: string;
};

type FormPerfil = {
  nome_perfil: string;
  cpf: string;
  matricula: string;
  orgao: string;
  lotacao: string;
  cargo: string;
  tipo_contrato: string;
  situacao_funcional: string;
  contrato: string;
  tipo_folha: string;
  classe: string;
  banco: string;
  agencia: string;
  conta: string;
  salario_base: string;
  salario_bruto: string;
  salario_liquido: string;
  observacoes: string;
};

function paraString(valor?: string | number) {
  return valor === undefined || valor === null ? '' : String(valor);
}

function formDePerfil(perfil: PerfilSalarial): FormPerfil {
  return {
    nome_perfil: perfil.nome_perfil || '',
    cpf: perfil.cpf || '',
    matricula: perfil.matricula || '',
    orgao: perfil.orgao || '',
    lotacao: perfil.lotacao || '',
    cargo: perfil.cargo || '',
    tipo_contrato: perfil.tipo_contrato || '',
    situacao_funcional: perfil.situacao_funcional || '',
    contrato: perfil.contrato || '',
    tipo_folha: perfil.tipo_folha || '',
    classe: perfil.classe || '',
    banco: perfil.banco || '',
    agencia: perfil.agencia || '',
    conta: perfil.conta || '',
    salario_base: paraString(perfil.salario_base),
    salario_bruto: paraString(perfil.salario_bruto),
    salario_liquido: paraString(perfil.salario_liquido),
    observacoes: perfil.observacoes || '',
  };
}

function paraNumeroFormulario(valor: string) {
  if (!valor.trim()) return undefined;
  const numero = Number.parseFloat(valor.replace(',', '.'));
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : undefined;
}

function criarRegistroDeAnalise(analise: AnaliseContracheque): ContrachequeRegistro {
  const agora = new Date().toISOString();
  return {
    id: gerarId(),
    arquivo_nome: analise.arquivo_nome,
    referencia: analise.referencia,
    orgao: analise.orgao,
    lotacao: analise.lotacao,
    cargo: analise.cargo,
    tipo_contrato: analise.tipo_contrato,
    situacao_funcional: analise.situacao_funcional,
    cpf: analise.cpf,
    matricula: analise.matricula,
    contrato: analise.contrato,
    tipo_folha: analise.tipo_folha,
    classe: analise.classe,
    banco: analise.banco,
    agencia: analise.agencia,
    conta: analise.conta,
    total_bruto: analise.total_bruto,
    total_descontos: analise.total_descontos,
    total_liquido: analise.total_liquido,
    rubricas: analise.rubricas || [],
    texto_extraido: analise.texto_extraido,
    observacoes: analise.observacoes,
    criado_em: agora,
    atualizado_em: agora,
  };
}

function encontrarPerfilCorrespondente(perfis: PerfilSalarial[], analise: AnaliseContracheque) {
  return perfis.find((perfil) => (
    (analise.cpf && perfil.cpf && analise.cpf === perfil.cpf)
    || (analise.matricula && perfil.matricula && analise.matricula === perfil.matricula)
  ));
}

function upsertPerfilPorAnalise(perfis: PerfilSalarial[], analise: AnaliseContracheque) {
  const agora = new Date().toISOString();
  const registro = criarRegistroDeAnalise(analise);
  const existente = encontrarPerfilCorrespondente(perfis, analise);

  if (!existente) {
    const novo: PerfilSalarial = {
      id: gerarId(),
      nome_perfil: analise.nome_perfil_sugerido,
      cpf: analise.cpf,
      matricula: analise.matricula,
      orgao: analise.orgao,
      lotacao: analise.lotacao,
      cargo: analise.cargo,
      tipo_contrato: analise.tipo_contrato,
      situacao_funcional: analise.situacao_funcional,
      contrato: analise.contrato,
      tipo_folha: analise.tipo_folha,
      classe: analise.classe,
      banco: analise.banco,
      agencia: analise.agencia,
      conta: analise.conta,
      salario_base: analise.salario_base,
      salario_bruto: analise.total_bruto,
      salario_liquido: analise.total_liquido,
      observacoes: analise.observacoes,
      historico: [registro],
      criado_em: agora,
      atualizado_em: agora,
    };
    return { perfis: [novo, ...perfis], perfilId: novo.id, atualizado: false };
  }

  const atualizado: PerfilSalarial = {
    ...existente,
    nome_perfil: existente.nome_perfil || analise.nome_perfil_sugerido,
    cpf: analise.cpf || existente.cpf,
    matricula: analise.matricula || existente.matricula,
    orgao: analise.orgao || existente.orgao,
    lotacao: analise.lotacao || existente.lotacao,
    cargo: analise.cargo || existente.cargo,
    tipo_contrato: analise.tipo_contrato || existente.tipo_contrato,
    situacao_funcional: analise.situacao_funcional || existente.situacao_funcional,
    contrato: analise.contrato || existente.contrato,
    tipo_folha: analise.tipo_folha || existente.tipo_folha,
    classe: analise.classe || existente.classe,
    banco: analise.banco || existente.banco,
    agencia: analise.agencia || existente.agencia,
    conta: analise.conta || existente.conta,
    salario_base: analise.salario_base ?? existente.salario_base,
    salario_bruto: analise.total_bruto ?? existente.salario_bruto,
    salario_liquido: analise.total_liquido ?? existente.salario_liquido,
    observacoes: analise.observacoes || existente.observacoes,
    historico: [registro, ...existente.historico],
    atualizado_em: agora,
  };

  return {
    perfis: perfis.map((perfil) => (perfil.id === existente.id ? atualizado : perfil)),
    perfilId: existente.id,
    atualizado: true,
  };
}

export default function Salarios() {
  const { config, atualizarConfig } = useFinanceiroStore();
  const [perfis, setPerfis] = useState<PerfilSalarial[]>([]);
  const [analise, setAnalise] = useState<AnaliseContracheque | null>(null);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [previewImagem, setPreviewImagem] = useState<string | null>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [perfilEditandoId, setPerfilEditandoId] = useState<string | null>(null);
  const [formPerfil, setFormPerfil] = useState<FormPerfil | null>(null);
  const [historicoAbertoId, setHistoricoAbertoId] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPerfis(storageSalarios.getAll());
  }, []);

  function persistir(lista: PerfilSalarial[]) {
    setPerfis(lista);
    storageSalarios.replaceAll(lista);
  }

  function abrirEditor(perfil: PerfilSalarial) {
    setPerfilEditandoId(perfil.id);
    setFormPerfil(formDePerfil(perfil));
  }

  function salvarEdicaoPerfil() {
    if (!perfilEditandoId || !formPerfil) return;
    const agora = new Date().toISOString();
    const atualizados = perfis.map((perfil) => (
      perfil.id !== perfilEditandoId
        ? perfil
        : {
            ...perfil,
            nome_perfil: formPerfil.nome_perfil,
            cpf: formPerfil.cpf || undefined,
            matricula: formPerfil.matricula || undefined,
            orgao: formPerfil.orgao || undefined,
            lotacao: formPerfil.lotacao || undefined,
            cargo: formPerfil.cargo || undefined,
            tipo_contrato: formPerfil.tipo_contrato || undefined,
            situacao_funcional: formPerfil.situacao_funcional || undefined,
            contrato: formPerfil.contrato || undefined,
            tipo_folha: formPerfil.tipo_folha || undefined,
            classe: formPerfil.classe || undefined,
            banco: formPerfil.banco || undefined,
            agencia: formPerfil.agencia || undefined,
            conta: formPerfil.conta || undefined,
            salario_base: paraNumeroFormulario(formPerfil.salario_base),
            salario_bruto: paraNumeroFormulario(formPerfil.salario_bruto),
            salario_liquido: paraNumeroFormulario(formPerfil.salario_liquido),
            observacoes: formPerfil.observacoes || undefined,
            atualizado_em: agora,
          }
    ));
    persistir(atualizados);
    setPerfilEditandoId(null);
    setFormPerfil(null);
    setMensagem('Perfil salarial atualizado.');
  }

  function excluirPerfil(id: string) {
    if (!confirm('Excluir este perfil salarial e todo o histórico de contracheques?')) return;
    persistir(perfis.filter((perfil) => perfil.id !== id));
    if (perfilEditandoId === id) {
      setPerfilEditandoId(null);
      setFormPerfil(null);
    }
    setMensagem('Perfil salarial removido.');
  }

  async function selecionarArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setArquivoSelecionado(arquivo);
    setErro('');
    setMensagem('');
    const reader = new FileReader();
    reader.onload = () => setPreviewImagem(reader.result as string);
    reader.readAsDataURL(arquivo);
  }

  async function analisarContracheque() {
    if (!arquivoSelecionado) return;
    setCarregandoIA(true);
    setErro('');
    setMensagem('');

    try {
      const formData = new FormData();
      formData.append('image', arquivoSelecionado);
      formData.append('provider', config.ai_modelo_ocr_padrao || 'automatico');
      formData.append('financialProvider', config.ai_modelo_padrao || 'automatico');
      formData.append('mode', (config.ai_modelo_ocr_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto');

      const resposta = await fetch('/api/ai/analisar-contracheque', {
        method: 'POST',
        body: formData,
      });
      const data = await resposta.json();
      if (!resposta.ok || !data?.success) {
        throw new Error(data?.error || 'Não foi possível analisar o contracheque.');
      }

      setAnalise(data.dados as AnaliseContracheque);
      setMensagem('Contracheque lido com sucesso. Revise os dados antes de salvar.');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao analisar contracheque.');
    } finally {
      setCarregandoIA(false);
    }
  }

  function salvarAnaliseComoPerfil() {
    if (!analise) return;
    const resultado = upsertPerfilPorAnalise(perfis, analise);
    persistir(resultado.perfis);
    setMensagem(resultado.atualizado ? 'Contracheque adicionado ao perfil existente.' : 'Novo perfil salarial criado.');
    setHistoricoAbertoId(resultado.perfilId);
    setAnalise(null);
    setPreviewImagem(null);
    setArquivoSelecionado(null);
    if (inputArquivoRef.current) inputArquivoRef.current.value = '';
  }

  const totalLiquido = useMemo(
    () => perfis.reduce((soma, perfil) => soma + (perfil.salario_liquido || 0), 0),
    [perfis],
  );

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
          <UserRound size={20} className="text-emerald-300" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Salário</h1>
          <p className="text-xs text-slate-500">Perfis salariais com leitura de contracheque por I.A. e histórico editável.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] text-slate-500">Perfis</div>
          <div className="mt-1 text-2xl font-bold text-white">{perfis.length}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] text-slate-500">Contracheques salvos</div>
          <div className="mt-1 text-2xl font-bold text-white">{perfis.reduce((soma, perfil) => soma + perfil.historico.length, 0)}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] text-slate-500">Total líquido atual</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300 tabular-nums">{formatarMoeda(totalLiquido)}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(255,255,255,0.02))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-white">Leitor de contracheque</h2>
            <p className="mt-1 text-xs text-slate-400">
              Envie um print do contracheque. A I.A. lê o documento, extrai os dados principais e gera ou atualiza um perfil salarial com histórico para acompanhamento.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <p className="mb-2 text-[11px] text-slate-500">Leitor OCR</p>
            <OCRModelSelect
              value={config.ai_modelo_ocr_padrao || 'automatico'}
              onChange={(value) => atualizarConfig({ ai_modelo_ocr_padrao: value })}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={selecionarArquivo}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputArquivoRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/[0.08]"
              >
                <FileImage size={16} />
                Escolher print
              </button>
              <button
                type="button"
                onClick={analisarContracheque}
                disabled={!arquivoSelecionado || carregandoIA}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {carregandoIA ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
                Ler com I.A.
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4">
              {previewImagem ? (
                <img src={previewImagem} alt="Preview do contracheque" className="max-h-[360px] w-full rounded-xl object-contain" />
              ) : (
                <div className="flex min-h-[180px] items-center justify-center text-center text-sm text-slate-500">
                  Envie uma imagem do contracheque para gerar um perfil.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
            <h3 className="text-sm font-semibold text-white">Prévia da análise</h3>
            {!analise ? (
              <p className="mt-3 text-sm text-slate-500">Os dados extraídos vão aparecer aqui antes de salvar o perfil.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[11px] text-slate-500">Perfil sugerido</div>
                  <div className="mt-1 text-sm font-semibold text-white">{analise.nome_perfil_sugerido}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="text-[11px] text-slate-500">Referência</div>
                    <div className="mt-1 text-sm font-semibold text-white">{analise.referencia}</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="text-[11px] text-slate-500">Líquido</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">{formatarMoeda(analise.total_liquido || 0)}</div>
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-slate-300">
                  <div><span className="text-slate-500">Órgão:</span> {analise.orgao || '—'}</div>
                  <div className="mt-1"><span className="text-slate-500">Lotação:</span> {analise.lotacao || '—'}</div>
                  <div className="mt-1"><span className="text-slate-500">Cargo:</span> {analise.cargo || '—'}</div>
                  <div className="mt-1"><span className="text-slate-500">CPF:</span> {analise.cpf || '—'}</div>
                  <div className="mt-1"><span className="text-slate-500">Matrícula:</span> {analise.matricula || '—'}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[11px] text-slate-500">Rubricas lidas</div>
                  <div className="mt-2 space-y-1">
                    {analise.rubricas.slice(0, 6).map((rubrica, index) => (
                      <div key={`${rubrica.descricao}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-slate-300">{rubrica.descricao}</span>
                        <span className={`tabular-nums ${rubrica.tipo === 'desconto' ? 'text-red-300' : 'text-emerald-300'}`}>
                          {formatarMoeda(rubrica.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={salvarAnaliseComoPerfil}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  <Plus size={16} />
                  Criar ou atualizar perfil
                </button>
              </div>
            )}
          </div>
        </div>

        {mensagem && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {mensagem}
          </div>
        )}
        {erro && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {erro}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {perfis.length === 0 ? (
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-8 text-center text-slate-500">
            Nenhum perfil salarial salvo ainda.
          </div>
        ) : (
          perfis.map((perfil) => {
            const editando = perfilEditandoId === perfil.id && formPerfil;
            const historicoAberto = historicoAbertoId === perfil.id;
            const ultimo = perfil.historico[0];

            return (
              <div key={perfil.id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">{perfil.nome_perfil}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {perfil.cargo || 'Cargo não informado'}
                      {perfil.orgao ? ` • ${perfil.orgao}` : ''}
                      {perfil.matricula ? ` • Matrícula ${perfil.matricula}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => historicoAberto ? setHistoricoAbertoId(null) : setHistoricoAbertoId(perfil.id)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
                    >
                      {historicoAberto ? 'Fechar histórico' : 'Ver histórico'}
                    </button>
                    {editando ? (
                      <>
                        <button
                          type="button"
                          onClick={salvarEdicaoPerfil}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <Save size={14} />
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPerfilEditandoId(null);
                            setFormPerfil(null);
                          }}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirEditor(perfil)}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => excluirPerfil(perfil.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  </div>
                </div>

                {editando ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {([
                      ['nome_perfil', 'Nome do perfil'],
                      ['cpf', 'CPF'],
                      ['matricula', 'Matrícula'],
                      ['orgao', 'Órgão'],
                      ['lotacao', 'Lotação'],
                      ['cargo', 'Cargo'],
                      ['tipo_contrato', 'Tipo de contrato'],
                      ['situacao_funcional', 'Situação funcional'],
                      ['contrato', 'Contrato'],
                      ['tipo_folha', 'Tipo de folha'],
                      ['classe', 'Classe'],
                      ['banco', 'Banco'],
                      ['agencia', 'Agência'],
                      ['conta', 'Conta'],
                      ['salario_base', 'Salário base'],
                      ['salario_bruto', 'Bruto'],
                      ['salario_liquido', 'Líquido'],
                    ] as const).map(([campo, label]) => (
                      <label key={campo} className="block">
                        <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
                        <input
                          type="text"
                          value={formPerfil[campo]}
                          onChange={(e) => setFormPerfil({ ...formPerfil, [campo]: e.target.value })}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        />
                      </label>
                    ))}
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-[11px] text-slate-500">Observações</span>
                      <textarea
                        rows={3}
                        value={formPerfil.observacoes}
                        onChange={(e) => setFormPerfil({ ...formPerfil, observacoes: e.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-white/[0.03] p-3">
                      <div className="text-[11px] text-slate-500">Líquido atual</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-300 tabular-nums">{formatarMoeda(perfil.salario_liquido || 0)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] p-3">
                      <div className="text-[11px] text-slate-500">Bruto</div>
                      <div className="mt-1 text-lg font-semibold text-white tabular-nums">{formatarMoeda(perfil.salario_bruto || 0)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] p-3">
                      <div className="text-[11px] text-slate-500">Base</div>
                      <div className="mt-1 text-lg font-semibold text-white tabular-nums">{formatarMoeda(perfil.salario_base || 0)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] p-3">
                      <div className="text-[11px] text-slate-500">Última referência</div>
                      <div className="mt-1 text-sm font-semibold text-white">{ultimo?.referencia || '—'}</div>
                    </div>
                  </div>
                )}

                {historicoAberto && (
                  <div className="mt-4 space-y-3 rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                    {perfil.historico.map((registro) => (
                      <details key={registro.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-white">{registro.referencia}</div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {registro.cargo || 'Cargo não informado'}
                                {registro.arquivo_nome ? ` • ${registro.arquivo_nome}` : ''}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[11px] text-slate-500">Total líquido</div>
                              <div className="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">{formatarMoeda(registro.total_liquido || 0)}</div>
                            </div>
                          </div>
                        </summary>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                          <div className="space-y-2 text-xs text-slate-300">
                            <div><span className="text-slate-500">Órgão:</span> {registro.orgao || '—'}</div>
                            <div><span className="text-slate-500">Lotação:</span> {registro.lotacao || '—'}</div>
                            <div><span className="text-slate-500">Cargo:</span> {registro.cargo || '—'}</div>
                            <div><span className="text-slate-500">Banco:</span> {registro.banco || '—'} {registro.agencia ? `• Ag. ${registro.agencia}` : ''} {registro.conta ? `• C/C ${registro.conta}` : ''}</div>
                          </div>
                          <div className="space-y-2">
                            <div className="rounded-xl bg-white/[0.03] p-3">
                              <div className="text-[11px] text-slate-500">Rubricas</div>
                              <div className="mt-2 space-y-1.5">
                                {registro.rubricas.map((rubrica, index) => (
                                  <div key={`${registro.id}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="truncate text-slate-300">{rubrica.descricao}</span>
                                    <span className={`tabular-nums ${
                                      rubrica.tipo === 'desconto'
                                        ? 'text-red-300'
                                        : rubrica.tipo === 'total'
                                        ? 'text-blue-300'
                                        : 'text-emerald-300'
                                    }`}>
                                      {formatarMoeda(rubrica.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {registro.texto_extraido && (
                          <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
                            <div className="mb-2 text-[11px] text-slate-500">Texto OCR salvo para acompanhamento</div>
                            <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-300">{registro.texto_extraido}</pre>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {mensagem && (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-500/20 bg-[#0f1c18] px-4 py-2 text-sm text-emerald-200 shadow-xl">
          <Check size={14} className="text-emerald-300" />
          {mensagem}
        </div>
      )}
    </div>
  );
}
