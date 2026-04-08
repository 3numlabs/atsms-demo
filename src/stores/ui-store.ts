import { create } from "zustand";
import type { OnboardingStep } from "@/types";

interface UIState {
  sidebarOpen: boolean;
  newChatModalOpen: boolean;
  onboardingStep: OnboardingStep;
  onboardingError: string | null;

  setSidebarOpen: (v: boolean) => void;
  setNewChatModalOpen: (v: boolean) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setOnboardingError: (error: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  newChatModalOpen: false,
  onboardingStep: "handle",
  onboardingError: null,

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setNewChatModalOpen: (v) => set({ newChatModalOpen: v }),
  setOnboardingStep: (step) => set({ onboardingStep: step, onboardingError: null }),
  setOnboardingError: (error) => set({ onboardingError: error }),
}));
