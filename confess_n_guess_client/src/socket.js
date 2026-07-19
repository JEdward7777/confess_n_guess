// The socket, reshaped for Cloudflare (harness/PORT.md D2).
//
// This keeps the socket.io surface the screens were written against - emit/on/off,
// `connected`, a synthetic 'connect' event, auto-reconnect - but speaks native WebSocket
// to a per-game Durable Object at /ws/<CODE>. The screens import it unchanged.
//
// The one protocol edge that differs from the Node version: a per-game DO needs the code
// to exist before a socket can route to it, so 'newGame' becomes POST /api/newGame here,
// and the resulting code opens the socket. Every other event passes through as
// {event, data} JSON.

const BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';

function wsUrl(code) {
    const base = BASE || window.location.origin;
    return base.replace(/^http/, 'ws') + '/ws/' + encodeURIComponent(code);
}

class GameSocket {
    constructor() {
        this.listeners = new Map();   // event -> Set<fn>
        this.ws = null;
        this.code = null;
        this.connected = false;       // mirrors socket.io's flag; App.tsx reads it
        this.reconnectDelay = 500;
        this.reconnectTimer = null;
        this.closedOnPurpose = false;
        this.pending = [];
    }

    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(fn);
    }

    off(event, fn) {
        this.listeners.get(event)?.delete(fn);
    }

    _fire(event, data) {
        for (const fn of this.listeners.get(event) ?? []) {
            try { fn(data); } catch (e) { console.error(e); }
        }
    }

    /**
     * Route an event. Everything the screens emit carries the game code (or is
     * 'newGame'), which is what lets this shim know where to connect.
     */
    emit(event, data) {
        if (event === 'newGame') {
            this._newGame();
            return;
        }
        // joinGame historically sent the bare code string; keep accepting both shapes.
        const payload = typeof data === 'string' ? { code: data } : (data ?? {});
        const code = (payload.code ?? '').toString().toUpperCase();
        if (event === 'joinGame') payload.code = code;

        if (!code) return; // nothing to route to

        if (code !== this.code || !this.ws) {
            this._connect(code, () => this._send(event, payload));
        } else if (this.ws.readyState === WebSocket.OPEN) {
            this._send(event, payload);
        } else {
            // Socket still opening (or mid-reconnect): queue behind the open.
            this.pending.push([event, payload]);
        }
    }

    _send(event, data) {
        this.ws?.send(JSON.stringify({ event, data }));
    }

    async _newGame() {
        try {
            const res = await fetch(BASE + '/api/newGame', { method: 'POST' });
            const { code } = await res.json();
            // Identify as host once connected; the server answers with the lobby, which
            // is the same reply the Node newGame handler sent.
            this._connect(code, () => this._send('identify', { role: 'host', code }));
        } catch (e) {
            console.error('newGame failed', e);
            this._fire('gameState', {
                screen: 0, // g1NewGame
                error: 'Could not reach the server',
                name: '', emoji: '', sharedState: { users: {}, code: '' }
            });
        }
    }

    _connect(code, onOpen) {
        this.closedOnPurpose = true; // silence the old socket's close handler
        this.ws?.close();
        this.closedOnPurpose = false;

        this.code = code;
        this.pending = onOpen ? [] : this.pending ?? [];
        const ws = new WebSocket(wsUrl(code));
        this.ws = ws;

        ws.addEventListener('open', () => {
            if (this.ws !== ws) return;
            this.connected = true;
            this.reconnectDelay = 500;
            // The 'connect' event is what App.tsx's identify-on-connect hangs off
            // (CNG-018); reconnects re-fire it so a refresh-less network blip still
            // resyncs (R3).
            this._fire('connect');
            onOpen?.();
            for (const [event, data] of this.pending ?? []) this._send(event, data);
            this.pending = [];
        });

        ws.addEventListener('message', ev => {
            if (this.ws !== ws) return;
            try {
                const { event, data } = JSON.parse(ev.data);
                this._fire(event, data);
            } catch { /* not ours */ }
        });

        ws.addEventListener('close', () => {
            if (this.ws !== ws || this.closedOnPurpose) return;
            this.connected = false;
            // Exponential backoff, capped; each successful open resets it.
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                if (this.code) this._connect(this.code);
            }, this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
        });
    }
}

export const socket = new GameSocket();
