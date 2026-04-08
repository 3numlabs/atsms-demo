import { useUIStore } from "@/stores/ui-store";

export function Header() {
  const setNewChatModalOpen = useUIStore((s) => s.setNewChatModalOpen);

  return (
    <div className="p-3 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-text-primary">ATSMS</span>
      </div>
      <button
        onClick={() => setNewChatModalOpen(true)}
        className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-sidebar-hover"
        title="New message"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {/* Pencil writing in a box */}
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
    </div>
  );
}
