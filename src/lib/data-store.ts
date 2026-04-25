import fs from 'fs/promises';
import path from 'path';

const DATA_DIR  = path.join(process.cwd(), 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'bot-queue.json');

export interface BotTransacao {
  id: string;
  valor: number;
  descricao: string;
  categoria: string;
  data: string;
  hora?: string;
  metodo_pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'nao_informado';
  parcelas?: number;
  local?: string;
  banco?: string;
  tipo: 'despesa' | 'receita';
  origem: 'whatsapp_texto' | 'whatsapp_audio' | 'whatsapp_imagem';
  importado: boolean;
  criadoEm: string;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function lerFila(): Promise<BotTransacao[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(QUEUE_FILE, 'utf-8');
    return JSON.parse(raw) as BotTransacao[];
  } catch {
    return [];
  }
}

export async function adicionarNaFila(
  t: Omit<BotTransacao, 'id' | 'importado' | 'criadoEm'>,
): Promise<BotTransacao> {
  const fila = await lerFila();
  const nova: BotTransacao = {
    ...t,
    id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    importado: false,
    criadoEm: new Date().toISOString(),
  };
  fila.push(nova);
  await fs.writeFile(QUEUE_FILE, JSON.stringify(fila, null, 2), 'utf-8');
  return nova;
}

export async function marcarImportadas(ids: string[]): Promise<void> {
  const fila = await lerFila();
  const atualizada = fila.map(t => ids.includes(t.id) ? { ...t, importado: true } : t);
  await fs.writeFile(QUEUE_FILE, JSON.stringify(atualizada, null, 2), 'utf-8');
}

export async function contarPendentes(): Promise<number> {
  const fila = await lerFila();
  return fila.filter(t => !t.importado).length;
}
