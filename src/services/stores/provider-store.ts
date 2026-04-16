import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface ProviderCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
}

interface StoreData {
  credentials: Record<string, ProviderCredential>;
  selectedModelId: string | null;
}

// ─── Store ───────────────────────────────────────────────────────────────────

class ProviderStore {
  private data: StoreData = { credentials: {}, selectedModelId: null };
  private filePath = '';

  async init(): Promise<void> {
    const base = await appDataDir();
    this.filePath = await join(base, 'provider-store.enc');
    await this.load();
  }

  // ── Credentials ──────────────────────────────────────────────────────────

  async setCredential(
    provider: string,
    credential: ProviderCredential,
  ): Promise<void> {
    this.data.credentials[provider] = credential;
    await this.save();
  }

  getCredential(provider: string): ProviderCredential | undefined {
    return this.data.credentials[provider];
  }

  async removeCredential(provider: string): Promise<void> {
    delete this.data.credentials[provider];
    await this.save();
  }

  get hasAnyCredentials(): boolean {
    return Object.keys(this.data.credentials).length > 0;
  }

  /**
   * Returns the access token for the given provider.
   * Placeholder for future OAuth refresh logic.
   */
  validAccessToken(provider: string): string | undefined {
    const cred = this.data.credentials[provider];
    if (!cred) return undefined;

    // TODO: if expiresAt is set and token is expired, refresh using refreshToken
    return cred.accessToken;
  }

  // ── Selected Model ───────────────────────────────────────────────────────

  get selectedModel(): string | null {
    return this.data.selectedModelId;
  }

  async setSelectedModel(modelId: string | null): Promise<void> {
    this.data.selectedModelId = modelId;
    await this.save();
  }

  /**
   * Returns selectedModelId, falling back to the first available model ID
   * from the provided list.
   */
  selectedModelOrFirst(availableModelIds: string[]): string | null {
    if (this.data.selectedModelId) return this.data.selectedModelId;
    return availableModelIds[0] ?? null;
  }

  // ── Persistence (encrypted) ──────────────────────────────────────────────

  private async save(): Promise<void> {
    const plaintext = JSON.stringify(this.data);
    const encrypted = await invoke<string>('encrypt_data', { plaintext });
    await writeTextFile(this.filePath, encrypted);
  }

  private async load(): Promise<void> {
    if (!(await exists(this.filePath))) {
      this.data = { credentials: {}, selectedModelId: null };
      return;
    }
    try {
      const encrypted = await readTextFile(this.filePath);
      const plaintext = await invoke<string>('decrypt_data', {
        ciphertext: encrypted,
      });
      this.data = JSON.parse(plaintext) as StoreData;
    } catch {
      this.data = { credentials: {}, selectedModelId: null };
    }
  }
}

export const providerStore = new ProviderStore();
