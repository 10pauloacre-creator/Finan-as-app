import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { APP_URL } from './src/config';
import { handleTexto  } from './src/handlers/texto';
import { handleAudio  } from './src/handlers/audio';
import { handleImagem } from './src/handlers/imagem';

const NUMERO_AUTORIZADO = (process.env.WHATSAPP_NUMERO_AUTORIZADO || '').replace(/\D/g, '');

// Logger silencioso — suprime o JSON bruto do Baileys
const silentLogger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn:  () => {}, error: () => {}, fatal: () => {},
  child: () => silentLogger,
} as any;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version }          = await fetchLatestBaileysVersion();

  console.clear();
  console.log('╔══════════════════════════════════╗');
  console.log('║  🤖  FinanceiroIA WhatsApp Bot   ║');
  console.log(`║  Baileys v${version.join('.')}${' '.repeat(Math.max(0, 19 - version.join('.').length))}║`);
  console.log(`║  App: ${APP_URL}${' '.repeat(Math.max(0, 26 - APP_URL.length))}║`);
  console.log('╚══════════════════════════════════╝');
  console.log('');
  console.log('⏳ Aguardando QR code...');
  console.log('');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
    browser: ['FinanceiroIA Bot', 'Chrome', '1.0.0'],
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // Exibe QR code quando disponível
    if (qr) {
      console.clear();
      console.log('📱 Escaneie o QR code com o WhatsApp:');
      console.log('   (WhatsApp → 3 pontos → Aparelhos conectados → Conectar aparelho)');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Reconectando...');
        startBot();
      } else {
        console.log('❌ Sessão encerrada. Delete a pasta auth/ e reinicie o bot.');
      }
    } else if (connection === 'open') {
      console.clear();
      console.log('✅ Bot conectado ao WhatsApp!');
      if (NUMERO_AUTORIZADO) {
        console.log(`🔒 Respondendo apenas: +${NUMERO_AUTORIZADO}`);
      }
      console.log('');
      console.log('Aguardando mensagens... (Ctrl+C para parar)');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      // Ignora mensagens antigas (mais de 60 segundos)
      const msgTimestamp = Number(msg.messageTimestamp || 0);
      const agoraSegundos = Math.floor(Date.now() / 1000);
      if (agoraSegundos - msgTimestamp > 60) continue;

      const from      = msg.key.remoteJid || '';
      const senderNum = from.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const msgType   = Object.keys(msg.message)[0];

      // fromMe = Paulo mandando para si mesmo (self-chat) → sempre permitir
      // fromMe = false → verificar se é do número autorizado
      if (!msg.key.fromMe && NUMERO_AUTORIZADO && !senderNum.endsWith(NUMERO_AUTORIZADO.slice(-10))) {
        console.log(`  [BLOQUEADO] ${senderNum}`);
        continue;
      }

      console.log(`📨 [${new Date().toLocaleTimeString('pt-BR')}] ${msgType} de ${senderNum}`);

      try {
        if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
          const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || '';
          await handleTexto(sock, msg, text);

        } else if (msgType === 'audioMessage') {
          await handleAudio(sock, msg);

        } else if (msgType === 'imageMessage') {
          await handleImagem(sock, msg);

        } else {
          await sock.sendMessage(from, {
            text: '📎 Tipo não suportado. Envie texto, áudio ou foto.',
          });
        }
      } catch (err) {
        console.error('❌ Erro:', err);
        await sock.sendMessage(from, {
          text: '❌ Erro ao processar. Tente novamente.',
        });
      }
    }
  });
}

startBot().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
