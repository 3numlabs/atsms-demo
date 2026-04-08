import { useUIStore } from "@/stores/ui-store";

export function EmptyState() {
  const setNewChatModalOpen = useUIStore((s) => s.setNewChatModalOpen);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mb-3">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-text-secondary"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <p className="text-sm text-text-secondary mb-3">No conversations yet</p>
      <button
        onClick={() => setNewChatModalOpen(true)}
        className="text-sm text-accent hover:text-accent-hover transition-colors"
      >
        Start a new message
      </button>
    </div>
  );
}
