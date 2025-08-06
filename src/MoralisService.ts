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
        blockExplorer: string
    }
} = {
    1: {
        nativeCurrency: "ETH",
        blockExplorer: "https://etherscan.io/"
    },
    10: {
        nativeCurrency: "ETH",
        blockExplorer: "https://optimistic.etherscan.io/"
    },
    56: {
        nativeCurrency: "BNB",
        blockExplorer: "https://bscscan.com/"
    },
    137: {
        nativeCurrency: "MATIC",
        blockExplorer: "https://polygonscan.com/"
    },
    250: {
        nativeCurrency: "FTM",
        blockExplorer: "https://ftmscan.com/"
    },
    8453: {
        nativeCurrency: "ETH",
        blockExplorer: "https://basescan.org/"
    },
    42161: {
        nativeCurrency: "ETH",
        blockExplorer: "https://arbiscan.io/"
    },
    43114: {
        nativeCurrency: "AVAX",
        blockExplorer: "https://snowtrace.io/"
    },

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
    ) {
    }

    async start() {
        await Moralis.start({ apiKey: this.apiKey, streamsSecret: this.apiKey, });
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
        //while (true) {

        //if (!paginatedResult.hasNext()) break

        //paginatedResult = await paginatedResult.next()
        //break
        //}
    }

    async onTxReceived(tx: UnifiedTxDocument) {
        const message = await this.convertTxToMessage(tx);

        try {
            const cachedMessageId = this.txHashMessageIdCache[tx.hash]
            if (cachedMessageId) {
                await this.mainApp.telegramService.editChannelMessage(cachedMessageId, message);
                delete this.txHashMessageIdCache[tx.hash]
                return
            }

            const res = await this.mainApp.telegramService.sendChannelMessage(message);
            if (!tx.confirmed) this.txHashMessageIdCache[tx.hash] = res.message_id
        } catch (error) {
            console.error("Error #8782", message, error)
            await this.mainApp.telegramService.sendChannelMessage("could not process incoming tx, contact dev for more details");
        }
    }

    async handleWebhook(data: IWebhook) {
        const result = this.batchProcessor.process(data)

        return Promise.all(
            [result.txs(), result.internalTxs()].flat()
                .map(({ document }) => this.onTxReceived(document))
        )
    }

    async convertTxToMessage(tx: UnifiedTxDocument) {
        const { nativeCurrency, blockExplorer } = blockchain[tx.chainId];

        const to = tx.to ?? tx.toAddress ?? "";
        const toName = await this.mainApp.redisService.getAddressName(to).catch(error => (console.error("Error #7976", error), null))
        const toTrunc = truncateMiddle(to, 12);
        const toUrl = new URL("address/" + to, blockExplorer);
        const toMark = `[${escapers.MarkdownV2(toName ?? toTrunc)}](${toUrl})`;

        const from = tx.from ?? tx.fromAddress ?? "";
        const fromName = await this.mainApp.redisService.getAddressName(from).catch(error => (console.error("Error #7976", error), null))
        const fromTrunc = truncateMiddle(from, 12);
        const fromUrl = new URL("address/" + from, blockExplorer);
        const fromMark = `[${escapers.MarkdownV2(fromName ?? fromTrunc)}](${fromUrl})`;

        const hashTrunc = truncateMiddle(tx.hash, 12);
        const hashUrl = new URL("tx/" + tx.hash, blockExplorer);
        const hashMark = `[${escapers.MarkdownV2(hashTrunc)}](${hashUrl})`;

        const ethValue = escapers.MarkdownV2(ethers.formatEther(tx.value).slice(0, 6));
        //const chainName = ethers.Network.from(tx.chainId).name.toUpperCase()
        const chainMark = escapers.MarkdownV2(`(chain: ${tx.chainId})`);

        const confirmedMark = tx.confirmed ? "🟢" : "🟡"

        return [
            `**New Transaction** ${hashMark} ${confirmedMark}`,
            "",
            fromName ? `${fromMark} ${escapers.MarkdownV2("->")} ${toMark}` : `${toMark} ${escapers.MarkdownV2("<-")} ${fromMark}`,
            "",
            `${ethValue} ${nativeCurrency} ${chainMark}`
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