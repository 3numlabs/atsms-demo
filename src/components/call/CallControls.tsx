import { useCallStore } from "@/stores/call-store";
import { hangup } from "@/lib/webrtc-manager";

export function CallControls() {
  const isMuted = useCallStore((s) => s.isMuted);
  const isCameraOff = useCallStore((s) => s.isCameraOff);
  const mediaTypes = useCallStore((s) => s.mediaTypes);
  const toggleMuted = useCallStore((s) => s.toggleMuted);
  const toggleCameraOff = useCallStore((s) => s.toggleCameraOff);

  const hasVideo = mediaTypes.includes("video");

  return (
    <div className="flex items-center gap-4">
      {/* Mute toggle */}
      <button
        onClick={toggleMuted}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
          isMuted ? "bg-white/20 text-white" : "bg-white/10 text-white hover:bg-white/20"
        }`}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isCameraOff ? "bg-white/20 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isCameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {isCameraOff ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23,7 16,12 23,17" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
        </button>
      )}

      {/* Hangup */}
      <button
        onClick={hangup}
        className="w-14 h-14 rounded-full bg-danger flex items-center justify-center text-white hover:bg-red-600 transition-colors"
        title="End call"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
          <line x1="23" y1="1" x2="1" y2="23" />
        </svg>
      </button>
    </div>
  );
}
