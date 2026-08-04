import { create } from "zustand";

/**
 * Membership events rendered inline in the transcript ("Alice added Bob"),
 * like any chat app shows them.
 *
 * These are NOT messages: the content format deliberately keeps membership at
 * the DCGKA layer, and the engine's frames carry no wall clock. So the client
 * records its own first-observation time and persists that locally — enough to
 * interleave with messages and survive a reload, without inventing wire
 * semantics. The authoritative history (causal order, no timestamps) is always
 * available from the engine via the member panel.
 */
export interface SystemEvent {
  /** Stable key: the membership op id (dedups across reloads and re-observation). */
  id: string;
  convoId: string;
  text: string;
  observedAt: number;
}

const KEY = "atsms-demo:system-events:v1";

function load(): SystemEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? [] : (JSON.parse(raw) as SystemEvent[]);
  } catch {
    return [];
  }
}

function save(events: SystemEvent[]): void {
  try {
    // Keep the tail bounded — this is a convenience view, not a record.
    localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
  } catch {
    /* storage full / unavailable — the view degrades, nothing breaks */
  }
}

interface SystemEventState {
  events: SystemEvent[];
  record: (event: Omit<SystemEvent, "observedAt">) => void;
  forConversation: (convoId: string) => SystemEvent[];
}

export const useSystemEventStore = create<SystemEventState>((set, get) => ({
  events: load(),

  record: (event) =>
    set((state) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      const events = [...state.events, { ...event, observedAt: Date.now() }];
      save(events);
      return { events };
    }),

  forConversation: (convoId) => get().events.filter((e) => e.convoId === convoId),
}));
