import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuidv4 } from "uuid";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ToolIndicator {
  name: string;
  args: string;
}

interface ChatError {
  message: string;
}

interface ChatState {
  sessions: ChatSession[];
  currentMessages: ChatMessage[];
  streamingText: string;
  displayedText: string;
  characterQueue: string;
  isStreaming: boolean;
  streamFinished: boolean;
  typingFinished: boolean;
  cursorVisible: boolean;
  autoScrollEnabled: boolean;
  showSkeleton: boolean;
  activeToolIndicator: ToolIndicator | null;
  isGenerating: boolean;
  error: ChatError | null;

  appendDelta: (text: string) => void;
  finishStream: () => void;
  tickTyping: (charsToAdd: number) => void;
  toggleCursor: () => void;
  setToolIndicator: (name: string, args: string) => void;
  clearToolIndicator: () => void;
  showError: (msg: string) => void;
  clearError: () => void;
  addUserMessage: (text: string) => void;
  commitAssistantMessage: () => void;
  reset: () => void;
  setAutoScroll: (enabled: boolean) => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    sessions: [],
    currentMessages: [],
    streamingText: "",
    displayedText: "",
    characterQueue: "",
    isStreaming: false,
    streamFinished: false,
    typingFinished: true,
    cursorVisible: true,
    autoScrollEnabled: true,
    showSkeleton: false,
    activeToolIndicator: null,
    isGenerating: false,
    error: null,

    appendDelta: (text: string) =>
      set((state) => {
        state.streamingText += text;
        state.characterQueue += text;
        state.isStreaming = true;
        state.showSkeleton = false;
      }),

    finishStream: () =>
      set((state) => {
        state.streamFinished = true;
        state.isStreaming = false;
        state.isGenerating = false;
      }),

    tickTyping: (charsToAdd: number) =>
      set((state) => {
        const chars = state.characterQueue.slice(0, charsToAdd);
        state.displayedText += chars;
        state.characterQueue = state.characterQueue.slice(charsToAdd);
        if (state.streamFinished && state.characterQueue.length === 0) {
          state.typingFinished = true;
        }
      }),

    toggleCursor: () =>
      set((state) => {
        state.cursorVisible = !state.cursorVisible;
      }),

    setToolIndicator: (name: string, args: string) =>
      set((state) => {
        state.activeToolIndicator = { name, args };
      }),

    clearToolIndicator: () =>
      set((state) => {
        state.activeToolIndicator = null;
      }),

    showError: (msg: string) =>
      set((state) => {
        state.error = { message: msg };
        state.isGenerating = false;
        state.isStreaming = false;
        state.showSkeleton = false;
      }),

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    addUserMessage: (text: string) =>
      set((state) => {
        const message: ChatMessage = {
          id: uuidv4(),
          role: "user",
          content: text,
          timestamp: Date.now(),
        };
        state.currentMessages.push(message);
        state.isGenerating = true;
        state.showSkeleton = true;
        state.streamingText = "";
        state.displayedText = "";
        state.characterQueue = "";
        state.streamFinished = false;
        state.typingFinished = false;
        state.error = null;
      }),

    commitAssistantMessage: () =>
      set((state) => {
        if (state.streamingText.length > 0) {
          const message: ChatMessage = {
            id: uuidv4(),
            role: "assistant",
            content: state.streamingText,
            timestamp: Date.now(),
          };
          state.currentMessages.push(message);
        }
        state.streamingText = "";
        state.displayedText = "";
        state.characterQueue = "";
        state.isStreaming = false;
        state.streamFinished = false;
        state.typingFinished = true;
        state.showSkeleton = false;
        state.activeToolIndicator = null;
      }),

    reset: () =>
      set((state) => {
        state.currentMessages = [];
        state.streamingText = "";
        state.displayedText = "";
        state.characterQueue = "";
        state.isStreaming = false;
        state.streamFinished = false;
        state.typingFinished = true;
        state.cursorVisible = true;
        state.autoScrollEnabled = true;
        state.showSkeleton = false;
        state.activeToolIndicator = null;
        state.isGenerating = false;
        state.error = null;
      }),

    setAutoScroll: (enabled: boolean) =>
      set((state) => {
        state.autoScrollEnabled = enabled;
      }),
  }))
);
