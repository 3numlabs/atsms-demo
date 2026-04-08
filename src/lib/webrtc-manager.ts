import { nanoid } from "nanoid";
import { parseWebRTCContent } from "@atsms/sms";
import type { ATSMSWebRTCContent } from "@atsms/sms";
import { useCallStore } from "@/stores/call-store";
import { sendWebRTCSignal } from "./webrtc-signaling";
import { resolveHandleFromDid, getCurrentDid } from "./atsms-bridge";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Module-level state (not in Zustand — imperative, not reactive)
let pc: RTCPeerConnection | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let pendingOfferSdp: string | null = null;
let pendingOfferCallId: string | null = null;
let pendingOfferConvoId: string | null = null;
let ringTimeout: ReturnType<typeof setTimeout> | null = null;

function getStore() {
  return useCallStore.getState();
}

function createPeerConnection(convoId: string, callId: string): RTCPeerConnection {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  conn.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("[WebRTC] Sending ICE candidate");
      sendWebRTCSignal(convoId, {
        type: "ice-candidate",
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
        callId,
        timestamp: Date.now(),
      }).catch((err) => console.error("[WebRTC] Failed to send ICE candidate:", err));
    }
  };

  conn.ontrack = (event) => {
    const store = getStore();
    let stream = store.remoteStream;
    if (!stream) {
      stream = new MediaStream();
      useCallStore.setState({ remoteStream: stream });
    }
    stream.addTrack(event.track);
    // Force re-render by setting the stream again
    useCallStore.setState({ remoteStream: stream });
  };

  conn.oniceconnectionstatechange = () => {
    console.log("[WebRTC] ICE connection state:", conn.iceConnectionState);
  };

  conn.onicegatheringstatechange = () => {
    console.log("[WebRTC] ICE gathering state:", conn.iceGatheringState);
  };

  conn.onconnectionstatechange = () => {
    const state = conn.connectionState;
    console.log("[WebRTC] Connection state:", state);

    if (state === "connected") {
      if (ringTimeout) {
        clearTimeout(ringTimeout);
        ringTimeout = null;
      }
      useCallStore.setState({
        status: "connected",
        startedAt: new Date(),
      });
    } else if (state === "failed" || state === "closed") {
      cleanup();
    }
  };

  return conn;
}

async function getMediaStream(
  mediaTypes: ("audio" | "video")[],
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mediaTypes.includes("video"),
  });
}

export async function startCall(
  convoId: string,
  recipientDid: string,
  mediaTypes: ("audio" | "video")[],
): Promise<void> {
  const store = getStore();
  if (store.status !== "idle") {
    console.warn("[WebRTC] Already in a call");
    return;
  }

  const callId = nanoid();
  const remoteHandle = await resolveHandleFromDid(recipientDid);

  useCallStore.setState({ status: "outgoing-ringing" });
  getStore().setCallInfo({
    callId,
    convoId,
    remoteDid: recipientDid,
    remoteHandle,
    mediaTypes,
  });

  try {
    // Get local media
    const localStream = await getMediaStream(mediaTypes);
    useCallStore.setState({ localStream });

    // Create peer connection
    pc = createPeerConnection(convoId, callId);
    localStream.getTracks().forEach((track) => pc!.addTrack(track, localStream));

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await sendWebRTCSignal(convoId, {
      type: "offer",
      sdp: offer.sdp,
      callId,
      mediaTypes,
      timestamp: Date.now(),
    });

    // Auto-hangup after 30 seconds if no answer
    ringTimeout = setTimeout(() => {
      const current = getStore();
      if (current.status === "outgoing-ringing") {
        console.log("[WebRTC] Ring timeout — no answer");
        hangup();
      }
    }, 30000);
  } catch (err: any) {
    console.error("[WebRTC] Failed to start call:", err);
    cleanup();
    throw err;
  }
}

export async function acceptCall(): Promise<void> {
  const store = getStore();
  if (store.status !== "incoming-ringing" || !pendingOfferSdp || !pendingOfferCallId || !pendingOfferConvoId) {
    console.warn("[WebRTC] No incoming call to accept");
    return;
  }

  const callId = pendingOfferCallId;
  const convoId = pendingOfferConvoId;
  const offerSdp = pendingOfferSdp;

  useCallStore.setState({ status: "connecting" });

  if (ringTimeout) {
    clearTimeout(ringTimeout);
    ringTimeout = null;
  }

  try {
    const localStream = await getMediaStream(store.mediaTypes);
    useCallStore.setState({ localStream });

    pc = createPeerConnection(convoId, callId);
    localStream.getTracks().forEach((track) => pc!.addTrack(track, localStream));

    // Set remote description (the offer)
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });

    // Flush any ICE candidates that arrived before we had the remote description
    for (const candidate of pendingCandidates) {
      await pc.addIceCandidate(candidate);
    }
    pendingCandidates = [];

    // Create and send answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await sendWebRTCSignal(convoId, {
      type: "answer",
      sdp: answer.sdp,
      callId,
      timestamp: Date.now(),
    });

    // Clear pending offer
    pendingOfferSdp = null;
    pendingOfferCallId = null;
    pendingOfferConvoId = null;
  } catch (err: any) {
    console.error("[WebRTC] Failed to accept call:", err);
    cleanup();
    throw err;
  }
}

export async function hangup(): Promise<void> {
  const store = getStore();
  if (store.callId && store.convoId) {
    try {
      await sendWebRTCSignal(store.convoId, {
        type: "hangup",
        callId: store.callId,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("[WebRTC] Failed to send hangup:", err);
    }
  }
  cleanup();
}

export function declineCall(): void {
  // Decline is just hangup with the pending call info
  const store = getStore();
  const callId = pendingOfferCallId || store.callId;
  const convoId = pendingOfferConvoId || store.convoId;

  if (callId && convoId) {
    sendWebRTCSignal(convoId, {
      type: "hangup",
      callId,
      timestamp: Date.now(),
    }).catch((err) => console.error("[WebRTC] Failed to send decline:", err));
  }
  cleanup();
}

export async function handleSignalingMessage(localMsg: {
  senderId: string;
  content: string;
  convoId: string;
}): Promise<void> {
  // Ignore our own messages (they echo back via messageAdded$)
  const myDid = getCurrentDid();
  if (localMsg.senderId === myDid) return;

  const webrtc: ATSMSWebRTCContent = parseWebRTCContent(localMsg.content);
  const store = getStore();

  // Ignore stale messages — WebRTC signaling older than 30s is useless.
  // For offers without a timestamp, reject them (all our offers include timestamps).
  const messageAge = webrtc.timestamp ? Date.now() - webrtc.timestamp : Infinity;
  if (messageAge > 30_000) {
    return;
  }

  // Ignore non-offer messages when idle (old hangups, answers, ice-candidates)
  if (store.status === "idle" && webrtc.type !== "offer") {
    return;
  }

  // If we're in an active call, ignore messages for a different callId
  if (store.callId && webrtc.callId !== store.callId && webrtc.type !== "offer") {
    return;
  }

  console.log("[WebRTC] Received signaling:", webrtc.type, "callId:", webrtc.callId, "status:", store.status);

  switch (webrtc.type) {
    case "offer": {
      // Duplicate offer for the same call (sync + WebSocket both deliver it)
      if (store.callId === webrtc.callId) return;

      if (store.status !== "idle") {
        // Busy with a different call — auto-decline
        await sendWebRTCSignal(localMsg.convoId, {
          type: "hangup",
          callId: webrtc.callId,
          timestamp: Date.now(),
        });
        return;
      }

      // Store the offer for when the user accepts
      pendingOfferSdp = webrtc.sdp || null;
      pendingOfferCallId = webrtc.callId;
      pendingOfferConvoId = localMsg.convoId;

      const remoteHandle = await resolveHandleFromDid(localMsg.senderId);

      useCallStore.setState({ status: "incoming-ringing" });
      getStore().setCallInfo({
        callId: webrtc.callId,
        convoId: localMsg.convoId,
        remoteDid: localMsg.senderId,
        remoteHandle,
        mediaTypes: webrtc.mediaTypes || ["audio"],
      });

      // Auto-decline after 30 seconds
      ringTimeout = setTimeout(() => {
        const current = getStore();
        if (current.status === "incoming-ringing") {
          console.log("[WebRTC] Incoming ring timeout");
          declineCall();
        }
      }, 30000);
      break;
    }

    case "answer": {
      // Duplicate answer (sync + WebSocket) — already applied
      if (store.status === "connecting" || store.status === "connected") return;

      if (!pc || store.status !== "outgoing-ringing") {
        console.warn("[WebRTC] Unexpected answer, status:", store.status);
        return;
      }

      if (ringTimeout) {
        clearTimeout(ringTimeout);
        ringTimeout = null;
      }

      useCallStore.setState({ status: "connecting" });

      await pc.setRemoteDescription({ type: "answer", sdp: webrtc.sdp });

      // Flush pending ICE candidates
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(candidate);
      }
      pendingCandidates = [];
      break;
    }

    case "ice-candidate": {
      if (!webrtc.candidate) return;

      const candidate: RTCIceCandidateInit = {
        candidate: webrtc.candidate.candidate,
        sdpMid: webrtc.candidate.sdpMid,
        sdpMLineIndex: webrtc.candidate.sdpMLineIndex,
      };

      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
      break;
    }

    case "hangup": {
      if (store.status === "ended" || store.status === "idle") break;
      console.log("[WebRTC] Remote hangup");
      useCallStore.setState({ status: "ended" });
      setTimeout(() => cleanup(), 1500);
      break;
    }
  }
}

function cleanup(): void {
  if (ringTimeout) {
    clearTimeout(ringTimeout);
    ringTimeout = null;
  }

  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }

  pendingCandidates = [];
  pendingOfferSdp = null;
  pendingOfferCallId = null;
  pendingOfferConvoId = null;

  getStore().reset();
}

// Clean up on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const store = getStore();
    if (store.status !== "idle" && store.callId && store.convoId) {
      // Best-effort hangup (may not complete)
      navigator.sendBeacon?.(
        "/api/hangup", // won't work, but the WebRTC connection will close anyway
        "",
      );
      cleanup();
    }
  });
}
