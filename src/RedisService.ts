import { createClient, RedisClientType } from "redis";

export class RedisService {
    private client!: RedisClientType;

    constructor(url: string) {
        this.client = createClient({ url })
    }

    async getAddressName(address: string) {
        return this.client.get(`blockmon:${address.toLowerCase()}:name`);
    }

    async setAddressName(address: string, name: string) {
        return this.client.set(`blockmon:${address.toLowerCase()}:name`, name);
    }

    async start() {
        await this.client.connect()
    }
}