import { useCallback, useState } from "react";
import { GlassButton } from "../GlassButton";
import { cn } from "../../lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceOption {
  id: string;
  label: string;
}

const KOKORO_VOICES: VoiceOption[] = [
  { id: "af_heart", label: "Heart" },
  { id: "af_bella", label: "Bella" },
  { id: "af_sarah", label: "Sarah" },
  { id: "af_aoede", label: "Aoede" },
  { id: "bf_emma", label: "Emma" },
  { id: "af_nicole", label: "Nicole" },
];

interface DownloadState {
  whisper: { downloaded: boolean; progress: number; downloading: boolean };
  kokoro: { downloaded: boolean; progress: number; downloading: boolean };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceSettings() {
  const [enabled, setEnabled] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1.0);
  const [downloads, setDownloads] = useState<DownloadState>({
    whisper: { downloaded: false, progress: 0, downloading: false },
    kokoro: { downloaded: false, progress: 0, downloading: false },
  });

  const handleDownload = useCallback((model: "whisper" | "kokoro") => {
    setDownloads((prev) => ({
      ...prev,
      [model]: { ...prev[model], downloading: true, progress: 0 },
    }));

    // Simulate download progress — replace with real download logic
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        setDownloads((prev) => ({
          ...prev,
          [model]: { downloaded: true, progress: 100, downloading: false },
        }));
      } else {
        setDownloads((prev) => ({
          ...prev,
          [model]: { ...prev[model], progress },
        }));
      }
    }, 300);
  }, []);

  const handlePreview = useCallback((_voiceId: string) => {
    // TODO: wire to actual TTS preview
  }, []);

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {/* Enable/disable toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-primary">Voice Mode</label>
        <button
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors duration-200",
            enabled ? "bg-accent" : "bg-glass"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
              enabled ? "translate-x-5.5" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* Model downloads */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Models
        </label>

        {(["whisper", "kokoro"] as const).map((model) => {
          const state = downloads[model];
          return (
            <div key={model} className="mb-2 flex items-center gap-3">
              <div className="flex flex-1 flex-col">
                <span className="text-sm text-text-primary capitalize">{model}</span>
                {state.downloading && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-glass">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${state.progress}%` }}
                    />
                  </div>
                )}
                {state.downloaded && (
                  <span className="text-[11px] text-green-400">Downloaded</span>
                )}
              </div>
              {!state.downloaded && !state.downloading && (
                <GlassButton
                  variant="primary"
                  className="px-2 py-0.5 text-[11px]"
                  onClick={() => handleDownload(model)}
                >
                  Download
                </GlassButton>
              )}
            </div>
          );
        })}
      </div>

      {/* Voice selection */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Voice
        </label>
        <div className="flex flex-col gap-1">
          {KOKORO_VOICES.map((voice) => (
            <div
              key={voice.id}
              className={cn(
                "flex items-center gap-3 rounded-[8px] px-3 py-1.5 transition-colors duration-150",
                selectedVoice === voice.id ? "bg-glass" : "hover:bg-glass"
              )}
            >
              <button
                onClick={() => setSelectedVoice(voice.id)}
                className="flex flex-1 items-center gap-2"
              >
                <div
                  className={cn(
                    "h-3 w-3 rounded-full border-2 transition-colors duration-150",
                    selectedVoice === voice.id
                      ? "border-accent bg-accent"
                      : "border-glass-border"
                  )}
                />
                <span className="text-sm text-text-primary">{voice.label}</span>
                <span className="text-[11px] text-text-muted">{voice.id}</span>
              </button>
              <GlassButton
                className="px-2 py-0.5 text-[11px]"
                onClick={() => handlePreview(voice.id)}
              >
                Preview
              </GlassButton>
            </div>
          ))}
        </div>
      </div>

      {/* Speed slider */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Speed: {speed.toFixed(2)}x
          </label>
          <GlassButton
            className="px-2 py-0.5 text-[11px]"
            onClick={() => setSpeed(1.0)}
          >
            Reset
          </GlassButton>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.3}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>0.8x</span>
          <span>1.3x</span>
        </div>
      </div>
    </div>
  );
}
