import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { AIModelId, AITaskKind, resolveAIExecutionOrder } from './catalog';

interface GenerateTextInput {
  task: AITaskKind;
  preferredModel?: AIModelId;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

interface GenerateTextResult {
  content: string;
  providerUsed: Exclude<AIModelId, 'automatico'>;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const HF_DEEPSEEK_MODEL = process.env.HF_MODEL || 'deepseek-ai/DeepSeek-V4-Pro:fireworks-ai';
const HF_GEMMA4_MODEL = process.env.HF_GEMMA4_MODEL || 'google/gemma-4-26B-A4B-it:novita';

function getGeminiClient() {
  return process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
}

function getAnthropicClient() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
}

function getGroqClient() {
  return process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
}

function getHFClient() {
  return process.env.HF_TOKEN
    ? new OpenAI({ baseURL: 'https://router.huggingface.co/v1', apiKey: process.env.HF_TOKEN })
    : null;
}

async function runGemini(system: string, user: string, temperature: number, maxTokens: number) {
  const client = getGeminiClient();
  if (!client) throw new Error('Gemini indisponível');
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });
  const result = await model.generateContent(`${system}\n\n${user}`);
  return result.response.text().trim();
}

async function runAnthropic(system: string, user: string, temperature: number, maxTokens: number) {
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic indisponível');
  const result = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

async function runGroq(system: string, user: string, temperature: number, maxTokens: number) {
  const client = getGroqClient();
  if (!client) throw new Error('Groq indisponível');
  const result = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return result.choices?.[0]?.message?.content?.trim() || '';
}

async function runHF(model: string, system: string, user: string, temperature: number, maxTokens: number) {
  const client = getHFClient();
  if (!client) throw new Error('Hugging Face indisponível');
  const result = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return result.choices?.[0]?.message?.content?.trim() || '';
}

export async function generateTextWithFallback(input: GenerateTextInput): Promise<GenerateTextResult> {
  const temperature = input.temperature ?? 0.3;
  const maxTokens = input.maxTokens ?? 800;
  const providers = resolveAIExecutionOrder(input.task, input.preferredModel);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      let content = '';

      if (provider === 'gemini') {
        content = await runGemini(input.system, input.user, temperature, maxTokens);
      } else if (provider === 'anthropic') {
        content = await runAnthropic(input.system, input.user, temperature, maxTokens);
      } else if (provider === 'groq') {
        content = await runGroq(input.system, input.user, temperature, maxTokens);
      } else if (provider === 'deepseek') {
        content = await runHF(HF_DEEPSEEK_MODEL, input.system, input.user, temperature, maxTokens);
      } else if (provider === 'gemma4') {
        content = await runHF(HF_GEMMA4_MODEL, input.system, input.user, temperature, maxTokens);
      }

      if (content) {
        return {
          content,
          providerUsed: provider,
        };
      }

      errors.push(`${provider}: resposta vazia`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Nenhum provedor de IA disponível.');
}
