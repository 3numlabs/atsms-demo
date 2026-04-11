import { useEffect, useRef, useState } from "react";
import { useCallStore } from "@/stores/call-store";
import { useProfileStore } from "@/stores/profile-store";
import { CallControls } from "./CallControls";
import { Avatar } from "@/components/ui/Avatar";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallOverlay() {
  const status = useCallStore((s) => s.status);
  const remoteHandle = useCallStore((s) => s.remoteHandle);
  const remoteDid = useCallStore((s) => s.remoteDid);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const mediaTypes = useCallStore((s) => s.mediaTypes);
  const startedAt = useCallStore((s) => s.startedAt);

  const profiles = useProfileStore((s) => s.profiles);
  const profile = remoteDid ? profiles[remoteDid] : undefined;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showControls, setShowControls] = useState(true);

  const hasVideo = mediaTypes.includes("video");
  const isConnected = status === "connected";
  const showRemoteVideo = hasVideo && remoteStream && isConnected;

  const isVisible =
    status === "outgoing-ringing" ||
    status === "connecting" ||
    status === "connected" ||
    status === "ended";

  // Attach streams to media elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (!isConnected || !startedAt) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected, startedAt]);

  // Auto-hide controls after 3s of inactivity (only when video is showing)
  useEffect(() => {
    if (!showRemoteVideo) {
      setShowControls(true);
      return;
    }

    function resetIdleTimer() {
      setShowControls(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    resetIdleTimer();
    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", resetIdleTimer);
      container.addEventListener("touchstart", resetIdleTimer);
      container.addEventListener("click", resetIdleTimer);
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (container) {
        container.removeEventListener("mousemove", resetIdleTimer);
        container.removeEventListener("touchstart", resetIdleTimer);
        container.removeEventListener("click", resetIdleTimer);
      }
    };
  }, [showRemoteVideo]);

  if (!isVisible) return null;

  const statusText =
    status === "outgoing-ringing"
      ? "Calling..."
      : status === "connecting"
        ? "Connecting..."
        : status === "ended"
          ? "Call ended"
          : formatDuration(elapsed);

  const displayName = profile?.displayName || remoteHandle;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-gradient-to-br from-gray-900 via-gray-950 to-black flex flex-col"
    >
      {/* Hidden audio element — ensures remote audio always plays */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top bar — caller info, always visible */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent pt-6 pb-12 px-6 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3">
          <Avatar
            name={remoteHandle || "?"}
            size={40}
            imageUrl={profile?.avatarUrl}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white truncate">
              {displayName}
            </h2>
            <p className="text-xs text-gray-300 truncate">{statusText}</p>
          </div>
        </div>
      </div>

      {/* Remote video (full screen) — always mounted */}
      <div className="flex-1 flex items-center justify-center relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover ${
            showRemoteVideo ? "block" : "hidden"
          }`}
        />

        {/* Avatar fallback (no video / not connected) */}
        {!showRemoteVideo && (
          <div className="flex flex-col items-center gap-6 z-10">
            <div className="relative">
              {(status === "outgoing-ringing" || status === "connecting") && (
                <div className="absolute inset-0 -m-3 rounded-2xl border-2 border-accent/40 animate-ping" />
              )}
              <Avatar
                name={remoteHandle || "?"}
                size={140}
                imageUrl={profile?.avatarUrl}
                className="rounded-2xl shadow-2xl"
              />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white mb-1">
                {displayName}
              </h2>
              {profile?.displayName && (
                <p className="text-sm text-gray-400">@{remoteHandle}</p>
              )}
            </div>
          </div>
        )}

        {/* Local video PiP — always mounted, only visible when video call is in progress */}
        <div
          className={`absolute top-24 right-4 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/30 z-10 ${
            hasVideo && localStream ? "block" : "hidden"
          }`}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover bg-gray-800"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      </div>

      {/* Bottom controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent pb-10 pt-12 transition-opacity duration-300 ${
          showControls || !showRemoteVideo
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Status text (only when no video, otherwise it's in the top bar) */}
        {!showRemoteVideo && (
          <p className="text-center text-sm text-gray-300 mb-6">
            {isConnected ? formatDuration(elapsed) : statusText}
          </p>
        )}

        {status !== "ended" && (
          <div className="flex justify-center">
            <CallControls />
          </div>
        )}
      </div>
    </div>
  );
}
