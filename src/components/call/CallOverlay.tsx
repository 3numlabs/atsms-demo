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
  const [elapsed, setElapsed] = useState(0);

  const hasVideo = mediaTypes.includes("video");
  const isVisible =
    status === "outgoing-ringing" ||
    status === "connecting" ||
    status === "connected" ||
    status === "ended";

  // Attach streams to video elements
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

  // Always attach remote stream to audio element for audio playback
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (status !== "connected" || !startedAt) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startedAt]);

  if (!isVisible) return null;

  const statusText =
    status === "outgoing-ringing"
      ? "Calling..."
      : status === "connecting"
        ? "Connecting..."
        : status === "ended"
          ? "Call ended"
          : formatDuration(elapsed);

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col">
      {/* Hidden audio element — ensures remote audio always plays */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {/* Remote video (full screen) or avatar */}
      <div className="flex-1 flex items-center justify-center relative">
        {hasVideo && remoteStream && status === "connected" ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Avatar
              name={remoteHandle || "?"}
              size={96}
              imageUrl={profile?.avatarUrl}
            />
            <h2 className="text-xl font-semibold text-white">
              {profile?.displayName || remoteHandle}
            </h2>
            {profile?.displayName && (
              <p className="text-sm text-gray-400">@{remoteHandle}</p>
            )}
          </div>
        )}

        {/* Local video PiP (bottom-right corner) */}
        {hasVideo && localStream && (
          <div className="absolute bottom-24 right-4 w-36 h-48 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        )}
      </div>

      {/* Status + controls */}
      <div className="flex flex-col items-center gap-4 pb-12 pt-4 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-sm text-gray-300">{statusText}</p>
        {status !== "ended" && <CallControls />}
      </div>
    </div>
  );
}
