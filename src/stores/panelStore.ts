import { create } from "zustand";

interface PanelState {
  isVisible: boolean;
  isDismissing: boolean;
  activeTab: number;
  isInsideSession: boolean;
  isInsideTool: boolean;
  isInsideTaskDetail: boolean;
  isInsideSkill: boolean;
  activeSessionId: string | null;
  activeToolId: string | null;
  activeSkillId: string | null;
  isVoiceMode: boolean;
  inputText: string;

  present: () => void;
  dismiss: () => void;
  setTab: (tab: number) => void;
  enterSession: (id: string) => void;
  exitSession: () => void;
  navigateBack: () => void;
  setInputText: (text: string) => void;
  setVoiceMode: (enabled: boolean) => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  isVisible: true,
  isDismissing: false,
  activeTab: 0,
  isInsideSession: false,
  isInsideTool: false,
  isInsideTaskDetail: false,
  isInsideSkill: false,
  activeSessionId: null,
  activeToolId: null,
  activeSkillId: null,
  isVoiceMode: false,
  inputText: "",

  present: () => set({ isVisible: true, isDismissing: false }),

  dismiss: () => {
    set({ isDismissing: true });
    // Allow animation to complete before hiding
    setTimeout(() => {
      set({ isVisible: false, isDismissing: false });
    }, 200);
  },

  setTab: (tab: number) => set({ activeTab: tab }),

  enterSession: (id: string) =>
    set({ isInsideSession: true, activeSessionId: id }),

  exitSession: () =>
    set({ isInsideSession: false, activeSessionId: null }),

  navigateBack: () => {
    const state = get();
    if (state.isInsideSkill) {
      set({ isInsideSkill: false, activeSkillId: null });
    } else if (state.isInsideTool) {
      set({ isInsideTool: false, activeToolId: null });
    } else if (state.isInsideTaskDetail) {
      set({ isInsideTaskDetail: false });
    } else if (state.isInsideSession) {
      set({ isInsideSession: false, activeSessionId: null });
    }
  },

  setInputText: (text: string) => set({ inputText: text }),
  setVoiceMode: (enabled: boolean) => set({ isVoiceMode: enabled }),
}));
