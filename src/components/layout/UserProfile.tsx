import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar } from "@/components/ui/Avatar";
import { fetchProfile } from "@/lib/atsms-bridge";

export function UserProfile() {
  const handle = useAuthStore((s) => s.handle);
  const did = useAuthStore((s) => s.did);
  const displayName = useAuthStore((s) => s.displayName);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const setProfile = useAuthStore((s) => s.setProfile);
  const fetched = useRef(false);

  useEffect(() => {
    if (!did || fetched.current) return;
    fetched.current = true;

    fetchProfile(did).then(({ displayName: dn, avatarUrl: av }) => {
      console.log("[ATSMS] Profile fetched:", { displayName: dn, avatarUrl: av ? av.substring(0, 80) + "..." : null });
      // Append @jpeg for reliable browser rendering
      const normalizedAvatar = av && !av.includes("@") ? av + "@jpeg" : av;
      setProfile(dn, normalizedAvatar);
    });
  }, [did, setProfile]);

  return (
    <div className="p-3 border-t border-border shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={handle || "?"} size={32} imageUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          {displayName && (
            <p className="text-sm font-medium text-text-primary truncate">
              {displayName}
            </p>
          )}
          <p className="text-xs text-text-secondary truncate">
            @{handle}
          </p>
        </div>
      </div>
    </div>
  );
}
