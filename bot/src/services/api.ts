import { APP_URL, BOT_SECRET } from '../config';
import { TransacaoBot } from '../state';

export async function salvarLote(transacoes: TransacaoBot[]): Promise<boolean> {
  try {
    const res = await fetch(`${APP_URL}/api/bot/lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
      body: JSON.stringify({ transacoes }),
    });
    return res.ok;
  } catch (err) {
    console.error('[api.salvarLote]', err);
    return false;
  }
}

export async function salvarTransacao(transacao: TransacaoBot): Promise<boolean> {
  try {
    const res = await fetch(`${APP_URL}/api/bot/transacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': BOT_SECRET,
      },
      body: JSON.stringify(transacao),
    });
    return res.ok;
  } catch (err) {
    console.error('[api.salvarTransacao]', err);
    return false;
  }
}

export interface ResumoMes {
  mes: number;
  ano: number;
  totalGasto: number;
  totalReceita: number;
  saldo: number;
  categorias: { nome: string; valor: number }[];
  totalTransacoes: number;
}

export async function buscarResumo(): Promise<ResumoMes | null> {
  try {
    const res = await fetch(`${APP_URL}/api/bot/resumo`);
    if (!res.ok) return null;
    return res.json() as Promise<ResumoMes>;
  } catch {
    return null;
  }
}
