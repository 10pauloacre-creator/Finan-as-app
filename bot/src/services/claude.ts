import Groq from 'groq-sdk';
import { TransacaoBot } from '../state';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const HOJE = () => new Date().toISOString().split('T')[0];

const SYSTEM_PROMPT = `Você é o assistente financeiro do FinanceiroIA.
Sua única função é extrair dados de gastos/receitas de mensagens em português brasileiro.

Sempre responda SOMENTE com JSON válido no formato:
{
  "tipo": "despesa" | "receita",
  "valor": number,
  "descricao": string,
  "categoria": string,
  "data": "YYYY-MM-DD",
  "hora": "HH:MM" | null,
  "metodo_pagamento": "pix" | "credito" | "debito" | "dinheiro" | "nao_informado",
  "parcelas": number | null,
  "local": string | null,
  "banco": string | null,
  "erro": null
}

Se não conseguir identificar um gasto/receita claro, responda:
{ "erro": "mensagem explicando por que não entendeu" }

Categorias disponíveis: Alimentação, Transporte, Saúde, Moradia, Educação, Lazer, Assinaturas, Vestuário, Beleza, Pets, Investimentos, Salário, Freelance, Outros.

Regras:
- Mercado/supermercado → Alimentação
- iFood/Rappi/delivery → Alimentação
- Uber/99/ônibus/combustível → Transporte
- Netflix/Spotify/assinatura → Assinaturas
- Farmácia/médico → Saúde
- Aluguel/condomínio → Moradia
- Se data não informada → use hoje (${HOJE()})
- Se hora não informada → null
- Se método não informado → "nao_informado"
- Se banco mencionado (Nubank, Itaú, Bradesco, etc.) → coloque o nome normalizado em "banco"
- Se banco não mencionado → null`;

async function chamarGroq(mensagem: string): Promise<string> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 512,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: mensagem },
    ],
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

function parseJSON(raw: string): TransacaoBot | { erro: string } {
  const json = raw.startsWith('```') ? raw.replace(/```json?\n?/g, '').replace(/```/g, '') : raw;
  const match = json.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : json;
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (parsed.erro) return { erro: String(parsed.erro) };
    delete parsed.erro;
    return parsed as unknown as TransacaoBot;
  } catch {
    return { erro: 'Não consegui interpretar a resposta da IA.' };
  }
}

export async function extrairTransacaoDeTexto(texto: string): Promise<TransacaoBot | { erro: string }> {
  const raw = await chamarGroq(texto);
  return parseJSON(raw);
}

export async function extrairTransacaoDeImagem(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  legenda?: string,
): Promise<TransacaoBot | { erro: string }> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.2-11b-vision-preview',
    max_tokens: 512,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mediaType};base64,${base64}` },
        },
        {
          type: 'text',
          text: (legenda ? `Legenda do usuário: "${legenda}". ` : '') +
            'Analise este comprovante ou nota fiscal e extraia os dados. Responda SOMENTE em JSON conforme o formato do sistema.',
        },
      ] as never,
    }],
  });
  const raw = response.choices[0]?.message?.content?.trim() || '';
  return parseJSON(raw);
}

export async function extrairExtratoDeImagem(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<TransacaoBot[] | { erro: string }> {
  const prompt = `Você está analisando um EXTRATO BANCÁRIO com múltiplas transações.
Extraia TODAS as transações visíveis e responda SOMENTE com um array JSON:
[
  {
    "tipo": "despesa" | "receita",
    "valor": number,
    "descricao": string,
    "categoria": string,
    "data": "YYYY-MM-DD",
    "hora": "HH:MM" | null,
    "metodo_pagamento": "pix" | "debito" | "credito" | "dinheiro" | "nao_informado",
    "parcelas": null,
    "local": null,
    "banco": string | null
  }
]
Hoje é ${HOJE()}.
Categorias: Alimentação, Transporte, Saúde, Moradia, Educação, Lazer, Assinaturas, Vestuário, Beleza, Pets, Investimentos, Salário, Freelance, Outros.
Se não for um extrato bancário, responda: {"erro": "Não é um extrato bancário"}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.2-11b-vision-preview',
    max_tokens: 2048,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: prompt },
      ] as never,
    }],
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const json = raw.startsWith('```') ? raw.replace(/```json?\n?/g, '').replace(/```/g, '') : raw;
  const match = json.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) return { erro: 'Não consegui extrair dados do extrato.' };

  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed as TransacaoBot[];
    if (parsed.erro) return { erro: String(parsed.erro) };
    return [parsed as TransacaoBot];
  } catch {
    return { erro: 'Não consegui interpretar o extrato.' };
  }
}

export async function extrairTransacaoDeTranscricao(transcricao: string): Promise<TransacaoBot | { erro: string }> {
  return extrairTransacaoDeTexto(`[TRANSCRIÇÃO DE ÁUDIO]: ${transcricao}`);
}
