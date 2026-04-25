import type { WASocket, proto } from '@whiskeysockets/baileys';
import { getPending, setPending, clearPending, TransacaoBot } from '../state';
import { extrairTransacaoDeTexto } from '../services/claude';
import { salvarTransacao, salvarLote, buscarResumo } from '../services/api';
import { formatarMoeda, formatarData, confirmarMsg } from '../utils/format';

const COMANDOS_SIM  = ['sim', 's', 'confirma', 'confirmar', 'ok', '👍', '✅'];
const COMANDOS_NAO  = ['não', 'nao', 'n', 'cancela', 'cancelar', 'errado', '❌', '👎'];
const COMANDOS_RESUMO = ['resumo', 'relatório', 'relatorio', 'balanço', 'balanco'];
const COMANDOS_AJUDA  = ['ajuda', 'help', 'oi', 'olá', 'ola', 'inicio', 'início'];

export async function handleTexto(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  text: string,
): Promise<void> {
  const jid   = msg.key.remoteJid!;
  const lower = text.trim().toLowerCase();

  await sock.sendPresenceUpdate('composing', jid);

  // ── Verificar se há confirmação pendente ──────────────────────────────────
  const pendente = getPending(jid);

  if (pendente) {
    if (COMANDOS_SIM.includes(lower)) {
      clearPending(jid);
      let ok: boolean;
      let resumoTexto: string;

      if (Array.isArray(pendente)) {
        ok = await salvarLote(pendente);
        const total = pendente.reduce((s, t) => s + t.valor, 0);
        resumoTexto = `${pendente.length} transações • Total: ${formatarMoeda(total)}`;
      } else {
        ok = await salvarTransacao(pendente);
        resumoTexto = confirmarMsg(pendente);
      }

      if (ok) {
        await sock.sendMessage(jid, {
          text: `✅ *Salvo com sucesso!*\n\n${resumoTexto}\n\n_Veja no app FinanceiroIA → Importar Bot_`,
        });
      } else {
        await sock.sendMessage(jid, {
          text: '❌ Não consegui salvar. O app está aberto e rodando?',
        });
      }
      return;
    }

    if (COMANDOS_NAO.includes(lower)) {
      clearPending(jid);
      await sock.sendMessage(jid, { text: '🗑️ Cancelado. Me envie o lançamento novamente quando quiser.' });
      return;
    }

    // Usuário enviou uma correção (nova mensagem com dados)
    clearPending(jid);
    // Cai para processamento normal abaixo
  }

  // ── Comandos especiais ────────────────────────────────────────────────────
  if (COMANDOS_AJUDA.includes(lower)) {
    await sock.sendMessage(jid, { text: mensagemAjuda() });
    return;
  }

  if (COMANDOS_RESUMO.some(c => lower.includes(c))) {
    await sock.sendMessage(jid, { text: '⏳ Buscando resumo...' });
    const resumo = await buscarResumo();
    if (!resumo) {
      await sock.sendMessage(jid, { text: '❌ Não consegui buscar o resumo. O app está rodando?' });
      return;
    }
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const nomeMes = meses[resumo.mes - 1];
    const catText = resumo.categorias.map(c =>
      `  ${c.nome}: ${formatarMoeda(c.valor)}`
    ).join('\n');

    await sock.sendMessage(jid, {
      text:
        `📊 *Resumo de ${nomeMes}/${resumo.ano}*\n\n` +
        `💸 Total gasto: *${formatarMoeda(resumo.totalGasto)}*\n` +
        `💰 Total recebido: *${formatarMoeda(resumo.totalReceita)}*\n` +
        `📈 Saldo: *${formatarMoeda(resumo.saldo)}*\n\n` +
        (catText ? `📂 *Top categorias:*\n${catText}\n\n` : '') +
        `🔢 ${resumo.totalTransacoes} transações via bot`,
    });
    return;
  }

  // ── Processar lançamento ──────────────────────────────────────────────────
  const resultado = await extrairTransacaoDeTexto(text);

  if ('erro' in resultado) {
    await sock.sendMessage(jid, {
      text:
        `❓ Não entendi o lançamento.\n\n` +
        `_${resultado.erro}_\n\n` +
        `*Exemplos:*\n` +
        `• "Gastei 45 reais no iFood"\n` +
        `• "Paguei 120 reais de luz no débito"\n` +
        `• "Recebi 3000 de salário"\n` +
        `• "resumo" para ver o balanço do mês`,
    });
    return;
  }

  // Confirmar com o usuário
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

function mensagemAjuda(): string {
  return (
    `🤖 *FinanceiroIA Bot*\n\n` +
    `Registre seus gastos rapidamente:\n\n` +
    `📝 *Texto:*\n` +
    `  "Gastei 50 no mercado"\n` +
    `  "Paguei 120 de luz no débito"\n` +
    `  "Recebi 3000 de salário"\n\n` +
    `🎤 *Áudio:*\n` +
    `  Fale o gasto — eu transcrevo e registro!\n\n` +
    `📷 *Foto:*\n` +
    `  Foto de comprovante ou nota fiscal\n\n` +
    `📊 *Consultas:*\n` +
    `  "resumo" → balanço do mês atual\n\n` +
    `_Após cada lançamento, confirme com SIM ou NÃO._`
  );
}
