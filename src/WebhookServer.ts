import { Server } from "bun";

import { MainApplication } from "./MainApplication";
import { isValidWebhookData } from "./MoralisService";

export class WebhookServer {
    private server?: Server;

    constructor(
        private mainApp: MainApplication,
    ) {
    }

    async start() {
        this.server = Bun.serve({
            fetch: async (req) => {
                const url = new URL(req.url);
                switch (url.pathname) {
                    case "/webhook": {
                        const data = await req.json()
                        const signature = req.headers.get("x-signature");

                        if (!isValidWebhookData(data, signature)) {
                            return new Response("invalid signature", { status: 400 })
                        }

                        await this.mainApp.moralisService.handleWebhook(data)
                        return new Response("ok");
                    }
                }
                return new Response("404", { status: 404 });
            },
        });

        console.log(`Webhook server is running on port ${this.server.port}`);
    }
}