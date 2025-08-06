import { Bot, CommandContext, Context, ErrorHandler, GrammyError, HttpError } from "grammy";
import { ethers } from "ethers";

import { MainApplication } from "./MainApplication";

export class TelegramService {
    private readonly bot: Bot;

    constructor(
        private mainApp: MainApplication,
        private botToken: string,
        private channelId: string,

    ) {
        this.bot = new Bot(this.botToken);
        this.init()
    }

    private init() {
        this.bot.catch(this.errorHandler.bind(this));
        this.bot.command("start", this.onStartCommand.bind(this));
        this.bot.command("add_address", this.onAddAddressCommand.bind(this));
        this.bot.command("edit_address", this.onEditAddressCommand.bind(this));
        this.bot.command("delete_address", this.onDeleteAddressCommand.bind(this));
        this.bot.command("get_addresses", this.onGetAddressCommand.bind(this));

        this.bot.on("my_chat_member", async (ctx) => {
            console.log("my_chat_member", JSON.stringify(ctx.myChatMember, null, 2))
        })
    }

    private errorHandler: ErrorHandler<Context> = (err) => {
        const ctx = err.ctx;
        console.error(`Error while handling update ${ctx.update.update_id}:`);
        const e = err.error;
        if (e instanceof GrammyError) {
            console.error("Error #8399", e.description);
        } else if (e instanceof HttpError) {
            console.error("Error #8398", e);
        } else {
            console.error("Error #8397", e);
        }
    }

    private async onStartCommand(ctx: CommandContext<Context>) {
        await ctx.reply("Welcome! Use /add_address <address> <name> to add an address to monitor.");
    }

    private async onEditAddressCommand(ctx: CommandContext<Context>) {
        const [address, name] = ctx.match.split(" ");
        if (!ethers.isAddress(address)) {
            await ctx.reply("Please provide an Ethereum address. Usage: /add_address 0x... <name>");
            return;
        }

        try {
            await this.mainApp.redisService.setAddressName(address, name);
            await ctx.reply(`Address ${address} name is changed to ${name}.`);
        } catch (error) {
            console.error("Error #4737", error)
            await ctx.reply(`Error #4737: Cannot set name for address ${address}.`);
        }
    }

    private async onAddAddressCommand(ctx: CommandContext<Context>) {
        const [address, name] = ctx.match.split(" ");
        if (!ethers.isAddress(address)) {
            await ctx.reply("Please provide an Ethereum address. Usage: /add_address 0x... <name>");
            return;
        }

        try {
            await this.mainApp.moralisService.addAddress(address);
            await this.mainApp.redisService.setAddressName(address, name);
            await ctx.reply(`Address ${address} has been added to the monitoring list.`);
        } catch (error) {
            console.error("Error #4736", error)
            await ctx.reply(`Error #4736: Address ${address} cannot be added to the monitoring list, check console for more information.`);
        }
    }

    private async onDeleteAddressCommand(ctx: CommandContext<Context>) {
        const address = ctx.match;
        if (!ethers.isAddress(address)) {
            await ctx.reply("Please provide an Ethereum address. Usage: /remove_address 0x...");
            return;
        }

        try {
            await this.mainApp.moralisService.deleteAddress(address);
            await ctx.reply(`Address ${address} has been removed from the monitoring list.`);
        } catch (error) {
            console.error("Error #4748", error)
            await ctx.reply(`Error #4748: Address ${address} cannot be removed from the monitoring list, check console for more information.`);
        }

    }

    private async onGetAddressCommand(ctx: CommandContext<Context>) {
        try {
            const addresses = (await Array.fromAsync(this.mainApp.moralisService.getAddresses())).filter(a => !!a);
            if (addresses.length === 0) {
                await ctx.reply(`No active addresses found`);
                return
            }

            const addressesWithNames = await Promise.all(addresses.map(address => this.mainApp.redisService.getAddressName(address.lowercase).then(name => ({ address, name })).catch(() => ({ address, name: null }))));

            await ctx.reply(`Active addresses:\n${addressesWithNames.map(({ address, name }) => name ? `${name}: ${address.checksum}` : address.checksum).join("\n")}`);
        } catch (error) {
            console.error("Error #3788", error)
            await ctx.reply(`Error #3788: Could not fetch active addresses, check console for more information.`);
        }

    }

    async sendChannelMessage(message: string) {
        return this.bot.api.sendMessage(this.channelId, message, { parse_mode: "MarkdownV2" });
    }

    async editChannelMessage(messageId: number, message: string) {
        return this.bot.api.editMessageText(this.channelId, messageId, message, { parse_mode: "MarkdownV2" });
    }

    async deleteChannelMessage(messageId: number) {
        return this.bot.api.deleteMessage(this.channelId, messageId);
    }

    async start() {
        await this.setBotCommands();

        await this.bot.start();
    }

    private async setBotCommands() {
        await this.bot.api.setMyCommands([
            { command: "start", description: "Start the bot" },
            { command: "add_address", description: "Add address to the monitoring list" },
            { command: "edit_address", description: "Edit address name" },
            { command: "delete_address", description: "Remove address from the monitoring list" },
            { command: "get_addresses", description: "Get list of active addresses" }
        ]);
    }
}

