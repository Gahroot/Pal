import { create } from "zustand";

export type MascotState =
  | "idle"
  | "typing"
  | "waiting"
  | "responding"
  | "thinking"
  | "happy";

interface MascotStoreState {
  currentState: MascotState;
  isHappy: boolean;
  isSad: boolean;

  setState: (s: MascotState) => void;
}

const happyStates: MascotState[] = ["happy", "responding"];
const sadStates: MascotState[] = ["waiting"];

export const useMascotStore = create<MascotStoreState>((set) => ({
  currentState: "idle",
  isHappy: false,
  isSad: false,

  setState: (s: MascotState) =>
    set({
      currentState: s,
      isHappy: happyStates.includes(s),
      isSad: sadStates.includes(s),
    }),
}));
