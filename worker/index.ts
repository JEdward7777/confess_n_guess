// Worker entry: routes API and WebSocket traffic to the per-game Durable Object;
// everything else falls through to static assets (the built React client).
// See harness/PORT.md — this file is M4; the M1 scaffold version only needs to boot.

import { GameDurableObject } from './GameDO';
export { GameDurableObject };

export interface Env {
    GAME: DurableObjectNamespace<GameDurableObject>;
    CNG_ROUND_SECONDS?: string;
    CNG_RESTART_SECONDS?: string;
    CNG_BACKSTOP_SECONDS?: string;
    CNG_CLEAN_TIME_MS?: string;
    CNG_QUESTION_COUNT?: string;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateGameCode(): string {
    return Array.from({ length: 5 }, () =>
        CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
    ).join('');
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // The one protocol edge that differs from the Node version (PORT.md D2): a
        // per-game DO needs the code to exist before a socket can route to it, so game
        // creation is an HTTP call and the client connects its socket afterwards.
        if (url.pathname === '/api/newGame' && request.method === 'POST') {
            // D9: "exists" means the DO has state. Retry on the tiny chance a fresh
            // code collides with a live game.
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = generateGameCode();
                const stub = env.GAME.getByName(code);
                const created = await stub.createGame(code);
                if (created) {
                    return Response.json({ code });
                }
            }
            return Response.json({ error: 'could not allocate a game code' }, { status: 503 });
        }

        // WebSocket per game: /ws/CODE
        const wsMatch = url.pathname.match(/^\/ws\/([A-Za-z0-9]{1,10})$/);
        if (wsMatch) {
            if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
                return new Response('expected a WebSocket upgrade', { status: 426 });
            }
            const code = wsMatch[1].toUpperCase();
            const stub = env.GAME.getByName(code);
            return stub.fetch(request);
        }

        // Anything else that reached the worker isn't an asset and isn't ours.
        return new Response('not found', { status: 404 });
    }
} satisfies ExportedHandler<Env>;
