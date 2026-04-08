import { create } from "zustand";

export type CallStatus =
  | "idle"
  | "outgoing-ringing"
  | "incoming-ringing"
  | "connecting"
  | "connected"
  | "ended";

interface CallState {
  status: CallStatus;
  callId: string | null;
  convoId: string | null;
  remoteDid: string | null;
  remoteHandle: string | null;
  mediaTypes: ("audio" | "video")[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  startedAt: Date | null;

  setStatus: (status: CallStatus) => void;
  setCallInfo: (info: {
    callId: string;
    convoId: string;
    remoteDid: string;
    remoteHandle: string;
    mediaTypes: ("audio" | "video")[];
  }) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleMuted: () => void;
  toggleCameraOff: () => void;
  setStartedAt: (date: Date) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  status: "idle",
  callId: null,
  convoId: null,
  remoteDid: null,
  remoteHandle: null,
  mediaTypes: [],
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  startedAt: null,

  setStatus: (status) => set({ status }),

  setCallInfo: (info) =>
    set({
      callId: info.callId,
      convoId: info.convoId,
      remoteDid: info.remoteDid,
      remoteHandle: info.remoteHandle,
      mediaTypes: info.mediaTypes,
    }),

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),

  toggleMuted: () => {
    const { isMuted, localStream } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = isMuted));
    }
    set({ isMuted: !isMuted });
  },

  toggleCameraOff: () => {
    const { isCameraOff, localStream } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = isCameraOff));
    }
    set({ isCameraOff: !isCameraOff });
  },

  setStartedAt: (date) => set({ startedAt: date }),

  reset: () => {
    const { localStream, remoteStream } = get();
    localStream?.getTracks().forEach((t) => t.stop());
    remoteStream?.getTracks().forEach((t) => t.stop());
    set({
      status: "idle",
      callId: null,
      convoId: null,
      remoteDid: null,
      remoteHandle: null,
      mediaTypes: [],
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
      startedAt: null,
    });
  },
}));
