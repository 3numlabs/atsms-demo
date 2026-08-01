import { nanoid } from "nanoid";
import { generateJWT } from "@atsms/sms";
import { useCallStore } from "@/stores/call-store";
import { sendWebRTCSignal, type InboundSignal } from "./webrtc-signaling";
import { resolveHandleFromDid, getCurrentDid, getEndpointCert } from "./atsms-bridge";
import { ATSMS_API_URL } from "./constants";

// Fallback STUN-only config (used if TURN credential fetch fails)
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

// Cache fetched TURN credentials to avoid re-fetching per call
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiresAt = 0;

async function getIceServers(): Promise<RTCIceServer[]> {
  // Return cached if still valid (with 5 min buffer before expiry)
  if (cachedIceServers && Date.now() < cacheExpiresAt - 300_000) {
    return cachedIceServers;
  }

  const cert = getEndpointCert();
  const did = getCurrentDid();
  if (!cert || !did || !cert.certificatePrivateKeyPEM) {
    console.warn("[WebRTC] No cert available, using fallback STUN");
    return FALLBACK_ICE_SERVERS;
  }

  try {
    const jwt = await generateJWT(
      cert.certificatePrivateKeyPEM,
      cert.serialNumber,
      did,
    );

    const res = await fetch(`${ATSMS_API_URL}/turn-credentials`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 3600 }),
    });

    if (!res.ok) {
      console.warn(`[WebRTC] TURN credential fetch failed: ${res.status}`);
      return FALLBACK_ICE_SERVERS;
    }

    const data = await res.json();
    cachedIceServers = data.iceServers;
    cacheExpiresAt = new Date(data.expiresAt).getTime();
    console.log("[WebRTC] Fetched TURN credentials, expires:", data.expiresAt);
    return cachedIceServers!;
  } catch (err) {
    console.warn("[WebRTC] Failed to fetch TURN credentials:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

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

function createPeerConnection(convoId: string, callId: string, iceServers: RTCIceServer[]): RTCPeerConnection {
  const conn = new RTCPeerConnection({ iceServers });

  conn.onicecandidate = (event) => {
    if (event.candidate) {
      // Parse candidate type: host (local), srflx (STUN), prflx, relay (TURN)
      const candidateType = event.candidate.candidate.match(/typ (\S+)/)?.[1];
      console.log(
        `[WebRTC] Sending ICE candidate (type: ${candidateType}):`,
        event.candidate.candidate.substring(0, 80),
      );
      sendWebRTCSignal(convoId, {
        type: "ice",
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
        callId,
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

      // Log which ICE candidate pair won and connection quality
      conn.getStats().then((stats) => {
        let foundPair = false;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            foundPair = true;
            const local = stats.get(report.localCandidateId);
            const remote = stats.get(report.remoteCandidateId);
            console.log(
              `[WebRTC] Connected via: local=${local?.candidateType}/${local?.protocol}/${local?.address} remote=${remote?.candidateType}/${remote?.protocol}/${remote?.address}`,
            );
            if (local?.candidateType === "relay" || remote?.candidateType === "relay") {
              console.log("[WebRTC] Using TURN relay (expect higher latency)");
            } else {
              console.log("[WebRTC] Direct P2P connection");
            }
          }
        });
        if (!foundPair) {
          console.warn("[WebRTC] No succeeded candidate pair found in stats");
        }
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
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: mediaTypes.includes("video")
      ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        }
      : false,
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
    // Fetch TURN credentials and get local media in parallel
    const [iceServers, localStream] = await Promise.all([
      getIceServers(),
      getMediaStream(mediaTypes),
    ]);
    useCallStore.setState({ localStream });

    // Create peer connection
    pc = createPeerConnection(convoId, callId, iceServers);
    localStream.getTracks().forEach((track) => pc!.addTrack(track, localStream));

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await sendWebRTCSignal(convoId, {
      type: "offer",
      sdp: offer.sdp,
      callId,
      mediaTypes,
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
    const [iceServers, localStream] = await Promise.all([
      getIceServers(),
      getMediaStream(store.mediaTypes),
    ]);
    useCallStore.setState({ localStream });

    pc = createPeerConnection(convoId, callId, iceServers);
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
    }).catch((err) => console.error("[WebRTC] Failed to send decline:", err));
  }
  cleanup();
}

export async function handleSignalingMessage(localMsg: InboundSignal): Promise<void> {
  // Ephemeral delivery already excludes our own sends and stale messages
  // (format §8) — the guard below is defense in depth only.
  const myDid = getCurrentDid();
  if (localMsg.senderId === myDid) return;

  const webrtc = localMsg.signal;
  const store = getStore();

  // Ignore non-offer messages when idle (old hangups, answers, ice candidates)
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

    case "ice": {
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
