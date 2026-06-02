import { NextResponse } from 'next/server';
import { AIModelId } from '@/lib/ai/aiModels';
import { runAI, runOCR } from '@/lib/ai/aiService';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function limparJsonMarkdown(valor: string) {
  return valor
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function paraNumero(valor: unknown) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Number(valor.toFixed(2));
  if (typeof valor !== 'string') return undefined;

  const limpo = valor
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const numero = Number.parseFloat(limpo);
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : undefined;
}

function paraTexto(valor: unknown) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

function paraRubricas(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const registro = item as Record<string, unknown>;
      const descricao = paraTexto(registro.descricao);
      const numero = paraNumero(registro.valor);
      const tipo = registro.tipo === 'provento' || registro.tipo === 'desconto' || registro.tipo === 'total' || registro.tipo === 'outro'
        ? registro.tipo
        : 'outro';

      if (!descricao || numero === undefined) return null;
      return { descricao, valor: numero, tipo };
    })
    .filter(Boolean);
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';

  try {
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'Envie a imagem do contracheque como multipart/form-data.' }, { status: 415 });
    }

    const formData = await req.formData();
    const image = formData.get('image') as File | null;
    const provider = String(formData.get('provider') || 'automatico') as AIModelId;
    const financialProvider = String(formData.get('financialProvider') || 'automatico') as AIModelId;
    const mode = String(formData.get('mode') || 'auto') === 'manual' ? 'manual' : 'auto';

    if (!image) {
      return NextResponse.json({ success: false, error: 'Imagem obrigatória.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(image.type)) {
      return NextResponse.json({ success: false, error: 'Tipo de arquivo não suportado.' }, { status: 415 });
    }

    if (image.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }, { status: 413 });
    }

    const ocrResult = await runOCR({ file: image, provider });
    if (!ocrResult.success || !ocrResult.text) {
      return NextResponse.json({ success: false, error: ocrResult.error || 'Não foi possível ler o contracheque.' }, { status: 500 });
    }

    const aiResult = await runAI({
      task: 'analisar_imagem_financeira',
      provider: financialProvider,
      mode: financialProvider !== 'automatico' ? 'manual' : mode,
      options: { temperature: 0.1, maxTokens: 2200 },
      input: {
        customPrompt: `Você recebeu o texto OCR de um contracheque brasileiro.
Extraia e devolva apenas JSON válido neste formato:
{
  "nome_perfil_sugerido": "string",
  "referencia": "MMM/YYYY ou MM/YYYY",
  "orgao": "string | null",
  "lotacao": "string | null",
  "cargo": "string | null",
  "tipo_contrato": "string | null",
  "situacao_funcional": "string | null",
  "cpf": "string | null",
  "matricula": "string | null",
  "contrato": "string | null",
  "tipo_folha": "string | null",
  "classe": "string | null",
  "banco": "string | null",
  "agencia": "string | null",
  "conta": "string | null",
  "salario_base": 0,
  "total_bruto": 0,
  "total_descontos": 0,
  "total_liquido": 0,
  "rubricas": [
    { "descricao": "string", "valor": 0, "tipo": "provento | desconto | total | outro" }
  ],
  "observacoes": "string | null"
}

Regras:
- Use apenas dados presentes no texto.
- Preserve textos exatamente como aparecem, sem resumir nomes de órgãos, cargos ou rubricas.
- "salario_base" deve priorizar a linha VENCIMENTO quando existir.
- "rubricas" deve incluir proventos, descontos e totais relevantes.
- Se algum campo faltar, use null.
- Não escreva explicações fora do JSON.

Texto OCR:
${ocrResult.text}`,
      },
    });

    if (!aiResult.success || !aiResult.answer) {
      return NextResponse.json({ success: false, error: aiResult.error || 'Não foi possível estruturar o contracheque.' }, { status: 500 });
    }

    const parsed = JSON.parse(limparJsonMarkdown(aiResult.answer)) as Record<string, unknown>;
    const rubricas = paraRubricas(parsed.rubricas);
    const referencia = paraTexto(parsed.referencia) || 'Sem referência';
    const cargo = paraTexto(parsed.cargo);
    const matricula = paraTexto(parsed.matricula);
    const cpf = paraTexto(parsed.cpf);

    return NextResponse.json({
      success: true,
      dados: {
        nome_perfil_sugerido: paraTexto(parsed.nome_perfil_sugerido) || cargo || matricula || cpf || 'Novo perfil salarial',
        referencia,
        orgao: paraTexto(parsed.orgao),
        lotacao: paraTexto(parsed.lotacao),
        cargo,
        tipo_contrato: paraTexto(parsed.tipo_contrato),
        situacao_funcional: paraTexto(parsed.situacao_funcional),
        cpf,
        matricula,
        contrato: paraTexto(parsed.contrato),
        tipo_folha: paraTexto(parsed.tipo_folha),
        classe: paraTexto(parsed.classe),
        banco: paraTexto(parsed.banco),
        agencia: paraTexto(parsed.agencia),
        conta: paraTexto(parsed.conta),
        salario_base: paraNumero(parsed.salario_base),
        total_bruto: paraNumero(parsed.total_bruto),
        total_descontos: paraNumero(parsed.total_descontos),
        total_liquido: paraNumero(parsed.total_liquido),
        rubricas,
        observacoes: paraTexto(parsed.observacoes),
        texto_extraido: ocrResult.text,
        arquivo_nome: image.name,
      },
      providerUsed: aiResult.providerUsed,
      modelUsed: aiResult.modelUsed,
      ocrProviderUsed: ocrResult.providerUsed,
      ocrModelUsed: ocrResult.modelUsed,
    });
  } catch (error) {
    console.error('[api/ai/analisar-contracheque]', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível analisar o contracheque agora. Tente novamente em instantes.' },
      { status: 500 },
    );
  }
}
