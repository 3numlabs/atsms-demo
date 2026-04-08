import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Avatar } from "@/components/ui/Avatar";

export function Header() {
  const handle = useAuthStore((s) => s.handle);
  const logout = useAuthStore((s) => s.logout);
  const setNewChatModalOpen = useUIStore((s) => s.setNewChatModalOpen);

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={handle || "?"} size={28} />
          <span className="text-sm font-medium text-text-primary truncate">
            @{handle}
          </span>
        </div>
        <button
          onClick={logout}
          className="text-text-secondary hover:text-text-primary text-xs transition-colors shrink-0"
          title="Logout"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
      <button
        onClick={() => setNewChatModalOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        New message
      </button>
    </div>
  );
}
