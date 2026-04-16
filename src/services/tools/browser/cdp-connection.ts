/**
 * CDP (Chrome DevTools Protocol) WebSocket connection.
 *
 * Ported from tama-agent CDPConnection.swift / pocket-agent cdp-tier.ts.
 * JSON-RPC client for communicating with a browser debug port.
 */

type CDPCallback = (params: Record<string, unknown>) => void;

interface PendingCommand {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class CDPConnection {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();
  private eventListeners = new Map<string, CDPCallback[]>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  /** Connect to a CDP WebSocket endpoint. */
  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (e) {
        reject(new Error(`Failed to create WebSocket: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('CDP connection timed out'));
        this.ws?.close();
      }, 10_000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this._connected = true;
        resolve();
      };

      this.ws.onerror = (event) => {
        clearTimeout(timeout);
        this._connected = false;
        reject(new Error(`WebSocket error: ${String(event)}`));
      };

      this.ws.onclose = () => {
        this._connected = false;
        // Reject all pending commands
        for (const [id, cmd] of this.pending) {
          cmd.reject(new Error('CDP connection closed'));
          this.pending.delete(id);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };
    });
  }

  /** Send a CDP command and wait for the response. */
  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws || !this._connected) {
      throw new Error('CDP not connected');
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command "${method}" timed out`));
      }, 30_000);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws!.send(message);
    });
  }

  /** Register a listener for a CDP event. */
  on(event: string, callback: CDPCallback): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  /** Remove all listeners for an event. */
  off(event: string): void {
    this.eventListeners.delete(event);
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this._connected = false;
    this.ws?.close();
    this.ws = null;
    for (const [, cmd] of this.pending) {
      cmd.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
    this.eventListeners.clear();
  }

  private handleMessage(data: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }

    // Response to a command
    if (typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) {
          const err = msg.error as Record<string, unknown>;
          pending.reject(new Error(String(err.message || 'CDP error')));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Event notification
    if (typeof msg.method === 'string') {
      const listeners = this.eventListeners.get(msg.method);
      if (listeners) {
        const params = (msg.params as Record<string, unknown>) || {};
        for (const cb of listeners) {
          try {
            cb(params);
          } catch (e) {
            console.error(`CDP event listener error for ${msg.method}:`, e);
          }
        }
      }
    }
  }
}
