export const MORALIS_API_KEY = process.env.MORALIS_API_KEY!;
if (!MORALIS_API_KEY) throw new Error("empty MORALIS_API_KEY")

export const MORALIS_STREAM_ID = process.env.MORALIS_STREAM_ID!;
if (!MORALIS_STREAM_ID) throw new Error("empty MORALIS_STREAM_ID")

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
if (!TELEGRAM_BOT_TOKEN) throw new Error("empty TELEGRAM_BOT_TOKEN")

export const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID!;
if (!TELEGRAM_CHANNEL_ID) throw new Error("empty TELEGRAM_CHANNEL_ID")

export const REDIS_URL = process.env.REDIS_URL!;
if (!REDIS_URL) throw new Error("empty REDIS_URL")