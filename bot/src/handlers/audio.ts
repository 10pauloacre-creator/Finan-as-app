import type { WASocket, proto } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { transcreverAudio } from '../services/groq';
import { extrairTransacaoDeTranscricao } from '../services/claude';
import { salvarTransacao } from '../services/api';
import { setPending } from '../state';
import { confirmarMsg } from '../utils/format';

export async function handleAudio(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
): Promise<void> {
  const jid = msg.key.remoteJid!;

  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🎤 Recebi o áudio! Transcrevendo...' });

  // Baixa o áudio
  const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;

  // Transcreve com Groq Whisper
  let transcricao: string;
  try {
    transcricao = await transcreverAudio(buffer, 'ogg');
  } catch (err) {
    console.error('[audio] Erro transcrição:', err);
    await sock.sendMessage(jid, {
      text: '❌ Não consegui transcrever o áudio. Tente enviar como mensagem de texto.',
    });
    return;
  }

  if (!transcricao.trim()) {
    await sock.sendMessage(jid, {
      text: '🔇 Não ouvi nada no áudio. Pode repetir em texto?',
    });
    return;
  }

  await sock.sendMessage(jid, { text: `📝 Transcrição: _"${transcricao}"_\n\nAnalisando...` });

  // Extrai transação com Claude
  const resultado = await extrairTransacaoDeTranscricao(transcricao);

  if ('erro' in resultado) {
    await sock.sendMessage(jid, {
      text:
        `❓ Não identifiquei um lançamento no áudio.\n\n` +
        `_${resultado.erro}_\n\n` +
        `Transcrição: _"${transcricao}"_\n\n` +
        `Tente enviar uma mensagem de texto com o valor e descrição.`,
    });
    return;
  }

  setPending(jid, resultado, async () => {
    await sock.sendMessage(jid, {
      text: '⏰ Confirmação expirada. Me envie o lançamento novamente.',
    });
  });

  await sock.sendMessage(jid, {
    text:
      `${resultado.tipo === 'despesa' ? '💸' : '💰'} *Entendi! Confirma?*\n\n` +
      confirmarMsg(resultado) +
      `\n\n_Responda *SIM* para salvar ou *NÃO* para cancelar._`,
  });
}
