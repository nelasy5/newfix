import Moralis from "moralis";
import { BatchProcessor } from "moralis/streams";
import { escapers } from "@telegraf/entity";

import { MainApplication } from "./MainApplication";
import { IWebhook } from "moralis/streams-typings";
import { ethers } from "ethers";
import { truncateMiddle } from "friendly-truncate";

const blockchain: {
    [key: number]: {
        nativeCurrency: string,
        blockExplorer: string,
        explorerType?: "EVM" | "SOL"
    }
} = {
    1: { nativeCurrency: "ETH", blockExplorer: "https://etherscan.io/", explorerType: "EVM" },
    10: { nativeCurrency: "ETH", blockExplorer: "https://optimistic.etherscan.io/", explorerType: "EVM" },
    56: { nativeCurrency: "BNB", blockExplorer: "https://bscscan.com/", explorerType: "EVM" },
    137: { nativeCurrency: "MATIC", blockExplorer: "https://polygonscan.com/", explorerType: "EVM" },
    250: { nativeCurrency: "FTM", blockExplorer: "https://ftmscan.com/", explorerType: "EVM" },
    8453: { nativeCurrency: "ETH", blockExplorer: "https://basescan.org/", explorerType: "EVM" },
    42161: { nativeCurrency: "ETH", blockExplorer: "https://arbiscan.io/", explorerType: "EVM" },
    43114: { nativeCurrency: "AVAX", blockExplorer: "https://snowtrace.io/", explorerType: "EVM" },
    // Solana networks
    101: { nativeCurrency: "SOL", blockExplorer: "https://explorer.solana.com", explorerType: "SOL" }, // Mainnet
    102: { nativeCurrency: "SOL", blockExplorer: "https://explorer.solana.com?cluster=testnet", explorerType: "SOL" }, // Testnet
    103: { nativeCurrency: "SOL", blockExplorer: "https://explorer.solana.com?cluster=devnet", explorerType: "SOL" }, // Devnet
}

interface UnifiedTxDocument {
    id: string;
    hash: string;
    chainId: number;
    value: string;
    gas: number;
    blockHash: string;
    blockTimestamp: number;
    blockNumber: number;
    confirmed: boolean;

    from?: string;
    to?: string;
    fromAddress?: string;
    toAddress?: string | null;
}

export class MoralisService {
    private batchProcessor = BatchProcessor.create();
    private txHashMessageIdCache: { [key: string]: number } = {}

    constructor(
        private mainApp: MainApplication,
        private apiKey: string,
        private streamId: string,
    ) {}

    async start() {
        await Moralis.start({ apiKey: this.apiKey, streamsSecret: this.apiKey });
    }

    async addAddress(address: string) {
        await Moralis.Streams.addAddress({ address, id: this.streamId });
    }

    async deleteAddress(address: string) {
        await Moralis.Streams.deleteAddress({ address, id: this.streamId });
    }

    async *getAddresses() {
        const paginatedResult = await Moralis.Streams.getAddresses({ id: this.streamId, limit: 100 })
        for (const { address } of paginatedResult.result) {
            yield address
        }
    }

    async onTxReceived(tx: UnifiedTxDocument) {
        try {
            const message = await this.convertTxToMessage(tx);
            console.log(message)

            const cachedMessageId = this.txHashMessageIdCache[tx.hash]
            if (cachedMessageId) {
                await this.mainApp.telegramService.editChannelMessage(cachedMessageId, message);
                delete this.txHashMessageIdCache[tx.hash]
                return
            }

            const res = await this.mainApp.telegramService.sendChannelMessage(message);
            if (!tx.confirmed) this.txHashMessageIdCache[tx.hash] = res.message_id
        } catch (error) {
            console.error("Error #8782", tx, error)
            await this.mainApp.telegramService.sendChannelMessage("could not process incoming tx, contact dev for more details");
        }
    }

    async handleWebhook(data: IWebhook) {
        const result = this.batchProcessor.process(data)
        console.log(result)

        return Promise.all(
            [result.txs(), result.internalTxs()].flat()
                .map(({ document }) => this.onTxReceived(document))
        )
    }

    async convertTxToMessage(tx: UnifiedTxDocument) {
        const config = blockchain[tx.chainId];
        if (!config) throw new Error("Unsupported chainId: " + tx.chainId);

        const { nativeCurrency, blockExplorer, explorerType } = config;

        // Формируем ссылки в зависимости от типа блокчейна
        const to = tx.to ?? tx.toAddress ?? "";
        const toName = await this.mainApp.redisService.getAddressName(to).catch(error => (console.error("Error #7976", error), null))
        const toTrunc = truncateMiddle(to, 12);
        const toUrl = explorerType === "SOL"
            ? `${blockExplorer}/address/${to}`
            : `${blockExplorer}/address/${to}`;
        const toMark = `[${escapers.MarkdownV2(toName ?? toTrunc)}](${toUrl})`;

        const from = tx.from ?? tx.fromAddress ?? "";
        const fromName = await this.mainApp.redisService.getAddressName(from).catch(error => (console.error("Error #7976", error), null))
        const fromTrunc = truncateMiddle(from, 12);
        const fromUrl = explorerType === "SOL"
            ? `${blockExplorer}/address/${from}`
            : `${blockExplorer}/address/${from}`;
        const fromMark = `[${escapers.MarkdownV2(fromName ?? fromTrunc)}](${fromUrl})`;

        const hashTrunc = truncateMiddle(tx.hash, 12);
        const hashUrl = explorerType === "SOL"
            ? `${blockExplorer}/tx/${tx.hash}`
            : `${blockExplorer}/tx/${tx.hash}`;
        const hashMark = `[${escapers.MarkdownV2(hashTrunc)}](${hashUrl})`;

        // Формат суммы
        const valueFormatted = nativeCurrency === "SOL"
            ? escapers.MarkdownV2((Number(tx.value) / 1e9).toFixed(6))
            : escapers.MarkdownV2(ethers.formatEther(tx.value).slice(0, 6));

        const chainMark = escapers.MarkdownV2(`(chain: ${tx.chainId})`);
        const confirmedMark = tx.confirmed ? "🟢" : "🟡";

        return [
            `**New Transaction** ${hashMark} ${confirmedMark}`,
            "",
            fromName
                ? `${fromMark} ${escapers.MarkdownV2("->")} ${toMark}`
                : `${toMark} ${escapers.MarkdownV2("<-")} ${fromMark}`,
            "",
            `${valueFormatted} ${nativeCurrency} ${chainMark}`
        ].join("\n");
    }
}

export function isValidWebhookData(data: unknown, signature?: string | null): data is IWebhook {
    try {
        return !!data && !!signature &&
            Moralis.Streams.verifySignature({
                body: data as IWebhook,
                signature,
            });
    } catch (error) {
        console.log("invalid signature received", data, signature)
        return true // suppress invalid check
    }
}
