import type { WASocket, proto } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { extrairTransacaoDeImagem, extrairExtratoDeImagem } from '../services/claude';
import { setPending } from '../state';
import { confirmarMsg, formatarMoeda } from '../utils/format';

const PALAVRAS_EXTRATO = ['extrato', 'statement', 'histórico', 'historico', 'importar'];

export async function handleImagem(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
): Promise<void> {
  const jid     = msg.key.remoteJid!;
  const legenda = msg.message?.imageMessage?.caption || '';
  const lower   = legenda.toLowerCase();

  await sock.sendPresenceUpdate('composing', jid);

  const mime = msg.message?.imageMessage?.mimetype || 'image/jpeg';
  const mediaType = (
    mime === 'image/png'  ? 'image/png'  :
    mime === 'image/webp' ? 'image/webp' :
    'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp';

  const isExtrato = PALAVRAS_EXTRATO.some(p => lower.includes(p));

  if (isExtrato) {
    await sock.sendMessage(jid, { text: '📊 Recebi o extrato! Analisando todas as transações...' });
    const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
    const base64 = buffer.toString('base64');

    const resultado = await extrairExtratoDeImagem(base64, mediaType);

    if ('erro' in resultado) {
      await sock.sendMessage(jid, {
        text:
          `❓ Não consegui ler o extrato.\n\n_${resultado.erro}_\n\n` +
          `Dica: envie a foto com melhor iluminação ou recorte apenas a parte com as transações.`,
      });
      return;
    }

    const lista = resultado.slice(0, 10);
    const total = lista.reduce((s, t) => s + t.valor, 0);
    const preview = lista.slice(0, 5).map(t =>
      `${t.tipo === 'despesa' ? '💸' : '💰'} ${t.descricao} — ${formatarMoeda(t.valor)} (${t.data})`
    ).join('\n');
    const extras = lista.length > 5 ? `\n_...e mais ${lista.length - 5} transações_` : '';

    setPending(jid, lista, async () => {
      await sock.sendMessage(jid, { text: '⏰ Confirmação expirada. Reenvie o extrato.' });
    });

    await sock.sendMessage(jid, {
      text:
        `📋 *Encontrei ${lista.length} transações!*\n\n` +
        `${preview}${extras}\n\n` +
        `💰 Total: *${formatarMoeda(total)}*\n\n` +
        `_Responda *SIM* para importar todas ou *NÃO* para cancelar._`,
    });
    return;
  }

  // Comprovante único
  await sock.sendMessage(jid, { text: '📷 Recebi a imagem! Analisando...' });
  const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
  const base64 = buffer.toString('base64');

  const resultado = await extrairTransacaoDeImagem(base64, mediaType, legenda || undefined);

  if ('erro' in resultado) {
    await sock.sendMessage(jid, {
      text:
        `❓ Não consegui identificar um comprovante na imagem.\n\n` +
        `_${resultado.erro}_\n\n` +
        `Tente enviar uma foto mais nítida ou descreva o gasto por texto.\n` +
        `💡 Para importar extrato completo, envie a foto com a legenda *"extrato"*.`,
    });
    return;
  }

  setPending(jid, resultado, async () => {
    await sock.sendMessage(jid, { text: '⏰ Confirmação expirada. Me envie o lançamento novamente.' });
  });

  await sock.sendMessage(jid, {
    text:
      `${resultado.tipo === 'despesa' ? '💸' : '💰'} *Comprovante lido! Confirma?*\n\n` +
      confirmarMsg(resultado) +
      `\n\n_Responda *SIM* para salvar ou *NÃO* para cancelar._`,
  });
}
