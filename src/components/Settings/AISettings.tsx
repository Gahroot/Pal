import { useCallback, useEffect, useMemo, useState } from "react";
import { providerStore } from "../../services/stores/provider-store";
import {
  PROVIDER_CONFIGS,
  modelsForProvider,
} from "../../services/ai/model-registry";
import type { AIProvider } from "../../types/index";
import { GlassButton } from "../GlassButton";
import { cn } from "../../lib/utils";

type ValidationStatus = "idle" | "checking" | "valid" | "invalid";

const PROVIDERS = Object.keys(PROVIDER_CONFIGS) as AIProvider[];

export function AISettings() {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle");

  const models = useMemo(() => modelsForProvider(selectedProvider), [selectedProvider]);

  // Load existing credential when provider changes
  useEffect(() => {
    const cred = providerStore.getCredential(selectedProvider);
    setApiKey(cred?.accessToken ?? "");
    setValidationStatus(cred ? "valid" : "idle");

    const selected = providerStore.selectedModel;
    const providerModels = modelsForProvider(selectedProvider);
    if (selected && providerModels.find((m) => m.id === selected)) {
      setSelectedModelId(selected);
    } else {
      setSelectedModelId(providerModels[0]?.id ?? null);
    }
  }, [selectedProvider]);

  const handleValidate = useCallback(async () => {
    if (!apiKey.trim()) return;
    setValidationStatus("checking");

    // Simple validation: try to make a minimal request
    try {
      const config = PROVIDER_CONFIGS[selectedProvider];
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.authHeaderStyle === "bearer") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else {
        headers["x-api-key"] = apiKey;
      }

      const model = models[0];
      const body =
        config.apiFormat === "openai"
          ? {
              model: model?.id ?? "",
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 1,
            }
          : {
              model: model?.id ?? "",
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 1,
            };

      const resp = await fetch(config.baseURL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      setValidationStatus(resp.ok || resp.status === 400 ? "valid" : "invalid");
    } catch {
      setValidationStatus("invalid");
    }
  }, [apiKey, selectedProvider, models]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) return;
    await providerStore.setCredential(selectedProvider, {
      accessToken: apiKey.trim(),
    });
    if (selectedModelId) {
      await providerStore.setSelectedModel(selectedModelId);
    }
    setValidationStatus("valid");
  }, [apiKey, selectedProvider, selectedModelId]);

  const handleClear = useCallback(async () => {
    await providerStore.removeCredential(selectedProvider);
    setApiKey("");
    setValidationStatus("idle");
  }, [selectedProvider]);

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {/* Provider tabs */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Provider
        </label>
        <div className="flex gap-1">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedProvider(p)}
              className={cn(
                "rounded-[6px] px-3 py-1 text-xs font-medium transition-colors duration-150",
                selectedProvider === p
                  ? "bg-tab-active text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {PROVIDER_CONFIGS[p].displayName}
            </button>
          ))}
        </div>
      </div>

      {/* API key */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          API Key
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setValidationStatus("idle");
            }}
            placeholder="Enter API key..."
            className="flex-1 rounded-[8px] bg-glass px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <GlassButton onClick={handleValidate} disabled={!apiKey.trim() || validationStatus === "checking"}>
            {validationStatus === "checking" ? "..." : "Validate"}
          </GlassButton>
        </div>

        {/* Status indicator */}
        {validationStatus !== "idle" && validationStatus !== "checking" && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                validationStatus === "valid" ? "bg-green-400" : "bg-red-400"
              )}
            />
            <span className="text-[11px] text-text-muted">
              {validationStatus === "valid" ? "Key is valid" : "Key is invalid"}
            </span>
          </div>
        )}
      </div>

      {/* Model selection */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Model
        </label>
        <select
          value={selectedModelId ?? ""}
          onChange={(e) => setSelectedModelId(e.target.value || null)}
          className="w-full rounded-[8px] bg-glass px-3 py-1.5 text-sm text-text-primary outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id} className="bg-neutral-800">
              {m.name} ({Math.round(m.contextWindow / 1000)}K ctx)
            </option>
          ))}
        </select>
      </div>

      {/* Save / Clear */}
      <div className="flex gap-2">
        <GlassButton variant="primary" onClick={handleSave} disabled={!apiKey.trim()}>
          Save Credential
        </GlassButton>
        <GlassButton onClick={handleClear}>Clear</GlassButton>
      </div>
    </div>
  );
}
