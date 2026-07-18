// One game = one Durable Object, keyed by the game code (PORT.md architecture).
// M1 scaffold: enough to boot and allocate games. M3 brings the dispatcher, the
// transitions, and the alarm.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

export class GameDurableObject extends DurableObject<Env> {
    /**
     * Initialize storage for a fresh game. Returns false if this code already hosts a
     * live game (D9: "exists" means storage has state), so the worker can retry with a
     * different code.
     */
    async createGame(code: string): Promise<boolean> {
        const existing = await this.ctx.storage.get('game');
        if (existing !== undefined) {
            return false;
        }
        await this.ctx.storage.put('game', { placeholder: true, code });
        return true;
    }

    async fetch(_request: Request): Promise<Response> {
        return new Response('not implemented until M3', { status: 501 });
    }
}
