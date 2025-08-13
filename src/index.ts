import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import Redis from 'ioredis';

// ====== ENV ======
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID; // @username или -100...
const HTTPS_RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
const WSS_RPC = process.env.SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com';
const EXPLORER = (process.env.EXPLORER || 'solscan').toLowerCase(); // solscan | solanafm | xray

// начальное «семя» адресов (если в Redis пусто) — можно оставить пустым
const SEED_ADDRS = (process.env.MONITOR_ADDRESSES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// кто может менять список адресов: перечислите chat.id через запятую (по желанию)
const ADMIN_CHAT_IDS = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ====== GUARDS ======
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!CHANNEL_ID) throw new Error('TELEGRAM_CHANNEL_ID is required');

// ====== TELEGRAM ======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ====== REDIS ======
const redisUrl = process.env.REDIS_URL; // например: redis://default:password@host:port
if (!redisUrl) console.warn('REDIS_URL не задан — команды /add и /remove не будут сохраняться между рестартами.');
const redis = redisUrl ? new Redis(redisUrl) : null;
const WATCH_SET_KEY = 'watch:addresses';

// ====== SOLANA CONNECTION ======
const connection = new Connection(HTTPS_RPC, { wsEndpoint: WSS_RPC, commitment: 'confirmed' });

// кеш подписей, чтобы не дублировать при реконнектах
const seenSignatures = new Set();
const SEEN_MAX = 5000;
function rememberSig(sig) {
  seenSignatures.add(sig);
  if (seenSignatures.size > SEEN_MAX) {
    for (const s of seenSignatures) { seenSignatures.delete(s); break; }
  }
}

// управление подписками: address(base58) -> subscriptionId
const subscriptions = new Map();

function txLink(signature) {
  switch (EXPLORER) {
    case 'solanafm': return `https://solana.fm/tx/${signature}?cluster=mainnet-solanafmbeta`;
    case 'xray':     return `https://xray.helius.xyz/tx/${signature}`;
    default:         return `https://solscan.io/tx/${signature}`;
  }
}
function addrLink(address) {
  switch (EXPLORER) {
    case 'solanafm': return `https://solana.fm/address/${address}?cluster=mainnet-solanafmbeta`;
    case 'xray':     return `https://xray.helius.xyz/address/${address}`;
    default:         return `https://solscan.io/account/${address}`;
  }
}
function lamportsToSOL(lamports) {
  return (lamports / 1_000_000_000).toFixed(6);
}

async function handleSignature(signature, mentionPubkeys) {
  if (seenSignatures.has(signature)) return;
  rememberSig(signature);

  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });
    if (!tx) return;
    const { meta, blockTime, transaction } = tx;
    const feeLamports = meta?.fee ?? 0;
    const ts = blockTime ? new Date(blockTime * 1000).toISOString() : 'unknown time';

    const pre = meta?.preBalances || [];
    const post = meta?.postBalances || [];
    const accounts = transaction.message.accountKeys.map(k => k.pubkey?.toBase58?.() || k.toBase58());

    const monitoredDeltas = [];
    for (const watched of mentionPubkeys) {
      const idx = accounts.findIndex(a => a === watched.toBase58());
      if (idx >= 0 && pre[idx] != null && post[idx] != null) {
        const delta = post[idx] - pre[idx];
        if (delta !== 0) {
          monitoredDeltas.push({ address: watched.toBase58(), deltaLamports: delta });
        }
      }
    }

    const title = `🟣 Новая транзакция в Solana`;
    const link = txLink(signature);

    const parts = [];
    parts.push(`${title}`);
    parts.push(`⏱️ Время: ${ts}`);
    parts.push(`💳 Подпись: <a href="${link}">${signature.slice(0,8)}…${signature.slice(-6)}</a>`);
    parts.push(`💸 Комиссия: ${lamportsToSOL(feeLamports)} SOL`);

    if (monitoredDeltas.length > 0) {
      parts.push(`\n📈 Изменения баланса (для отслеживаемых):`);
      for (const d of monitoredDeltas) {
        const sign = d.deltaLamports > 0 ? '+' : '';
        parts.push(
          `• <a href="${addrLink(d.address)}">${d.address.slice(0,4)}…${d.address.slice(-4)}</a>: ` +
          `${sign}${lamportsToSOL(d.deltaLamports)} SOL`
        );
      }
    } else {
      parts.push(`\nℹ️ Адрес(а) упомянут(ы) в транзакции (возможно SPL).`);
      for (const m of mentionPubkeys) {
        const a = m.toBase58();
        parts.push(`• <a href="${addrLink(a)}">${a.slice(0,4)}…${a.slice(-4)}</a>`);
      }
    }

    awai
