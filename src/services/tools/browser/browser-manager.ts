/**
 * Browser manager — discovers, launches, and connects to browsers via CDP.
 *
 * Ported from tama-agent BrowserManager.swift / pocket-agent browser/launcher.ts.
 * Uses Rust invoke for process launching on Windows.
 */

import { invoke } from '@tauri-apps/api/core';
import { CDPConnection } from './cdp-connection.ts';

const DEFAULT_DEBUG_PORT = 9222;

interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/** Known Windows browser paths. */
const BROWSER_PATHS = [
  // Chrome
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  // Edge
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // Brave
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];

export class BrowserManager {
  private connection: CDPConnection | null = null;
  private debugPort: number;

  constructor(debugPort: number = DEFAULT_DEBUG_PORT) {
    this.debugPort = debugPort;
  }

  get isConnected(): boolean {
    return this.connection?.connected ?? false;
  }

  getConnection(): CDPConnection | null {
    return this.connection;
  }

  /** Discover available browser executables on the system. */
  async discoverBrowsers(): Promise<string[]> {
    const found: string[] = [];
    for (const path of BROWSER_PATHS) {
      try {
        // Use Rust to check if file exists
        const exists = await invoke<boolean>('file_exists', { path });
        if (exists) found.push(path);
      } catch {
        // Skip if invoke not available
      }
    }
    return found;
  }

  /** Launch a browser with remote debugging enabled. */
  async launchBrowser(browserPath?: string): Promise<void> {
    const path = browserPath || (await this.findFirstBrowser());
    if (!path) {
      throw new Error('No browser found. Install Chrome, Edge, or Brave.');
    }

    try {
      await invoke('launch_browser', {
        browserPath: path,
        debugPort: this.debugPort,
      });
    } catch (e) {
      throw new Error(`Failed to launch browser: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Wait for debug port to be ready
    await this.waitForDebugPort();
  }

  /** Connect to an already-running browser debug port. */
  async connectToDebugPort(): Promise<CDPConnection> {
    const targets = await this.discoverTargets();
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page targets found on debug port.');
    }

    const conn = new CDPConnection();
    await conn.connect(pageTarget.webSocketDebuggerUrl);
    this.connection = conn;
    return conn;
  }

  /** Ensure we have an active connection, launching browser if needed. */
  async ensureConnected(): Promise<CDPConnection> {
    if (this.connection?.connected) {
      return this.connection;
    }

    // Try connecting to existing debug port first
    try {
      return await this.connectToDebugPort();
    } catch {
      // No browser with debug port running — launch one
    }

    await this.launchBrowser();
    return await this.connectToDebugPort();
  }

  /** Disconnect from the browser. */
  disconnect(): void {
    this.connection?.disconnect();
    this.connection = null;
  }

  /** Discover CDP targets on the debug port. */
  private async discoverTargets(): Promise<CDPTarget[]> {
    const response = await fetch(`http://localhost:${this.debugPort}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Failed to discover targets: HTTP ${response.status}`);
    }
    return (await response.json()) as CDPTarget[];
  }

  private async findFirstBrowser(): Promise<string | null> {
    const browsers = await this.discoverBrowsers();
    return browsers[0] || null;
  }

  private async waitForDebugPort(maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`http://localhost:${this.debugPort}/json/version`, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) return;
      } catch {
        // Not ready yet
      }
    }
    throw new Error(`Browser debug port ${this.debugPort} not reachable after ${maxAttempts} attempts`);
  }
}
