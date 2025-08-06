import { MORALIS_API_KEY, MORALIS_STREAM_ID, REDIS_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } from "./env";

import { MoralisService } from "./MoralisService";
import { RedisService } from "./RedisService";
import { TelegramService } from "./TelegramService";
import { WebhookServer } from "./WebhookServer";

export class MainApplication {
    readonly moralisService: MoralisService;
    readonly telegramService: TelegramService;
    readonly webhookServer: WebhookServer;
    readonly redisService: RedisService;

    constructor() {
        this.moralisService = new MoralisService(this, MORALIS_API_KEY, MORALIS_STREAM_ID);
        this.telegramService = new TelegramService(this, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID);
        this.webhookServer = new WebhookServer(this);
        this.redisService = new RedisService(REDIS_URL)
    }

    start() {
        this.redisService.start().catch(error => console.log("Error #7840", error))
        this.telegramService.start().catch(error => console.log("Error #7880", error))
        this.webhookServer.start().catch(error => console.log("Error #7890", error))
        this.moralisService.start().catch(error => console.log("Error #7870", error))

        console.error("Application is fully operational");
    }
}