import { useEffect } from "react";
import { useCallStore } from "@/stores/call-store";
import { useProfileStore } from "@/stores/profile-store";
import { acceptCall, declineCall } from "@/lib/webrtc-manager";
import { Avatar } from "@/components/ui/Avatar";

export function IncomingCallModal() {
  const status = useCallStore((s) => s.status);
  const remoteDid = useCallStore((s) => s.remoteDid);
  const remoteHandle = useCallStore((s) => s.remoteHandle);
  const mediaTypes = useCallStore((s) => s.mediaTypes);
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const profile = remoteDid ? profiles[remoteDid] : undefined;

  useEffect(() => {
    if (remoteDid) fetchProfileByDid(remoteDid);
  }, [remoteDid, fetchProfileByDid]);

  if (status !== "incoming-ringing") return null;

  const hasVideo = mediaTypes.includes("video");
  const callTypeLabel = hasVideo ? "Video Call" : "Audio Call";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-8 text-center">
        <Avatar
          name={remoteHandle || "?"}
          size={72}
          imageUrl={profile?.avatarUrl}
          className="mx-auto mb-4"
        />
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          {profile?.displayName || remoteHandle}
        </h2>
        {profile?.displayName && (
          <p className="text-sm text-text-secondary mb-1">@{remoteHandle}</p>
        )}
        <p className="text-sm text-text-secondary mb-6">
          Incoming {callTypeLabel}
        </p>

        <div className="flex items-center justify-center gap-6">
          {/* Decline */}
          <button
            onClick={declineCall}
            className="w-14 h-14 rounded-full bg-danger flex items-center justify-center text-white hover:bg-red-600 transition-colors"
            title="Decline"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>

          {/* Accept */}
          <button
            onClick={() => acceptCall()}
            className="w-14 h-14 rounded-full bg-success flex items-center justify-center text-white hover:bg-green-600 transition-colors"
            title="Accept"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
