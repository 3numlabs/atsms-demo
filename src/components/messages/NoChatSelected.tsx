import { useUIStore } from "@/stores/ui-store";

export function NoChatSelected() {
  const setNewChatModalOpen = useUIStore((s) => s.setNewChatModalOpen);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-surface flex items-center justify-center mb-4">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-text-secondary"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">
        Welcome to ATSMS
      </h2>
      <p className="text-sm text-text-secondary max-w-xs mb-4">
        End-to-end encrypted messaging on AT Protocol.
        Select a conversation or start a new one.
      </p>
      <button
        onClick={() => setNewChatModalOpen(true)}
        className="text-sm text-accent hover:text-accent-hover transition-colors font-medium"
      >
        Start a new message
      </button>
    </div>
  );
}
