import { useCallStore } from "@/stores/call-store";
import { hangup } from "@/lib/webrtc-manager";

export function CallControls() {
  const isMuted = useCallStore((s) => s.isMuted);
  const isCameraOff = useCallStore((s) => s.isCameraOff);
  const mediaTypes = useCallStore((s) => s.mediaTypes);
  const toggleMuted = useCallStore((s) => s.toggleMuted);
  const toggleCameraOff = useCallStore((s) => s.toggleCameraOff);

  const hasVideo = mediaTypes.includes("video");

  const baseButton =
    "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 backdrop-blur-md shadow-lg active:scale-95";

  return (
    <div className="flex items-center gap-5">
      {/* Mute toggle */}
      <button
        onClick={toggleMuted}
        className={`${baseButton} ${
          isMuted
            ? "bg-white text-gray-900 hover:bg-gray-100"
            : "bg-white/15 text-white hover:bg-white/25 ring-1 ring-white/20"
        }`}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Camera toggle (video calls only) */}
      {hasVideo && (
        <button
          onClick={toggleCameraOff}
          className={`${baseButton} ${
            isCameraOff
              ? "bg-white text-gray-900 hover:bg-gray-100"
              : "bg-white/15 text-white hover:bg-white/25 ring-1 ring-white/20"
          }`}
          title={isCameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {isCameraOff ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23,7 16,12 23,17" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
        </button>
      )}

      {/* Hangup */}
      <button
        onClick={hangup}
        className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 active:scale-95 transition-all duration-150 shadow-2xl ring-2 ring-red-500/30"
        title="End call"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ transform: "rotate(135deg)" }}
        >
          <path d="M20.487 17.14l-4.065-3.696a1.001 1.001 0 00-1.391.043l-2.393 2.461c-.576-.11-1.734-.471-2.926-1.66-1.192-1.193-1.553-2.354-1.66-2.926l2.459-2.394a1 1 0 00.043-1.391L6.859 3.513a1 1 0 00-1.391-.087l-2.17 1.861a1 1 0 00-.29.649c-.015.25-.301 6.172 4.291 10.766C11.305 20.707 16.323 21 17.705 21c.202 0 .326-.006.359-.008a.992.992 0 00.648-.291l1.86-2.171a.997.997 0 00-.085-1.39z" />
        </svg>
      </button>
    </div>
  );
}
