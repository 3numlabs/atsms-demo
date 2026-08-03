import { useEffect, useState } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { Avatar } from "@/components/ui/Avatar";
import { CallButtons } from "@/components/call/CallButtons";
import { removeMemberFromConversation } from "@/lib/atsms-bridge";

export function MessagePane() {
  const [showMembers, setShowMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const setActive = useConversationStore((s) => s.setActive);
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const did = useAuthStore((s) => s.did);
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const convo = conversations.find((c) => c.id === activeConvoId);

  const isGroup = (convo?.participantDids.length ?? 0) > 2;
  const others =
    convo?.participantHandles.filter(
      (_, i) => convo.participantDids[i] !== did,
    ) ?? [];

  const otherIdx = convo?.participantDids.findIndex((d) => d !== did) ?? -1;
  const otherDid =
    !isGroup && otherIdx >= 0 ? convo!.participantDids[otherIdx] : null;
  const otherHandle =
    otherIdx >= 0
      ? convo!.participantHandles[otherIdx]
      : convo?.participantHandles[0] || "Unknown";

  const profile = otherDid ? profiles[otherDid] : undefined;

  useEffect(() => {
    if (otherDid) fetchProfileByDid(otherDid);
  }, [otherDid, fetchProfileByDid]);

  useEffect(() => {
    if (activeConvoId) {
      loadMessages(activeConvoId);
    }
  }, [activeConvoId, loadMessages]);

  const displayLabel = isGroup
    ? convo?.title || others.join(", ") || `${others.length + 1} people`
    : profile?.displayName || otherHandle;

  return (
    <div className="flex flex-col h-full">
      {/* Conversation header */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-3 border-b border-border bg-main shrink-0">
        {/* Back button — mobile only */}
        <button
          onClick={() => setActive(null)}
          className="md:hidden p-1 -ml-1 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <Avatar
          name={isGroup ? displayLabel : otherHandle}
          size={28}
          imageUrl={isGroup ? null : profile?.avatarUrl}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">
            {displayLabel}
          </h2>
          {isGroup ? (
            <button
              type="button"
              onClick={() => {
                setShowMembers(!showMembers);
                setMemberError(null);
              }}
              className="block text-xs text-text-secondary truncate hover:text-text-primary transition-colors"
            >
              {others.length + 1} members · {others.map((h) => `@${h}`).join(" ")}
            </button>
          ) : (
            profile?.displayName && (
              <p className="text-xs text-text-secondary truncate">@{otherHandle}</p>
            )
          )}
        </div>
        {/* Calls are 1:1 (A→B) — no group-call surface yet. */}
        {!isGroup && <CallButtons />}
      </div>

      {/* Group member panel: roster + removal (admin-only; the engine rejects
          non-admin removes and the error is surfaced verbatim). */}
      {isGroup && showMembers && convo && (
        <div className="border-b border-border bg-main px-4 py-2 space-y-1 shrink-0">
          {convo.participantDids.map((mDid, i) => {
            const mHandle = convo.participantHandles[i];
            const isSelf = mDid === did;
            return (
              <div key={mDid} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary truncate">
                  @{mHandle}
                  {isSelf && " (you)"}
                </span>
                {!isSelf && (
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={async () => {
                      setMemberError(null);
                      setRemoving(mDid);
                      try {
                        await removeMemberFromConversation(convo.id, mDid);
                      } catch (err: any) {
                        setMemberError(
                          /Unauthorized/.test(err?.message ?? "")
                            ? "Only a group admin can remove members."
                            : err?.message || "Could not remove member",
                        );
                      } finally {
                        setRemoving(null);
                      }
                    }}
                    className="text-red-400/80 hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    {removing === mDid ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
          {memberError && <p className="text-xs text-red-400">{memberError}</p>}
        </div>
      )}

      <MessageList />
      <MessageComposer />
    </div>
  );
}
