import { useEffect, useState } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { Avatar } from "@/components/ui/Avatar";
import { CallButtons } from "@/components/call/CallButtons";
import {
  conversationAdmins,
  grantAdminTo,
  leaveConversation,
  leavingWouldStrand,
  memberDevices,
  membershipHistory,
  removeMemberFromConversation,
} from "@/lib/atsms-bridge";

export function MessagePane() {
  const [showMembers, setShowMembers] = useState(false);
  const [devices, setDevices] = useState<Map<string, string[]>>(new Map());
  const [history, setHistory] = useState<
    Array<{ opId: string; type: "create" | "add" | "remove"; actorDid: string; deviceDids: string[]; deviceFingerprints: string[] }>
  >([]);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [wouldStrand, setWouldStrand] = useState(false);
  const [admins, setAdmins] = useState<string[]>([]);
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

  // Membership history + per-DID device inventory (debug surface): both are
  // derived from the engine, so they refresh whenever the roster changes.
  useEffect(() => {
    if (!activeConvoId || !showMembers) return;
    void memberDevices(activeConvoId).then(setDevices);
    void membershipHistory(activeConvoId).then(setHistory);
    void leavingWouldStrand(activeConvoId).then(setWouldStrand);
    void conversationAdmins(activeConvoId).then(setAdmins);
  }, [activeConvoId, showMembers, convo?.participantDids.length]);

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
              <div key={mDid} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary truncate">
                  @{mHandle}
                  {isSelf && " (you)"}
                  {admins.includes(mDid) && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-accent/80">admin</span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                {/* Only an admin may promote, and only a non-admin can be promoted. */}
                {!convo.removed && did !== null && admins.includes(did) && !admins.includes(mDid) && (
                  <button
                    type="button"
                    className="text-accent/90 hover:text-accent transition-colors"
                    onClick={async () => {
                      setMemberError(null);
                      try {
                        await grantAdminTo(convo.id, mDid);
                        setAdmins(await conversationAdmins(convo.id));
                        setWouldStrand(await leavingWouldStrand(convo.id));
                      } catch (err) {
                        setMemberError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    Make admin
                  </button>
                )}
                {!isSelf && !convo.removed && (
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={async () => {
                      setMemberError(null);
                      setRemoving(mDid);
                      try {
                        await removeMemberFromConversation(convo.id, mDid);
                      } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        setMemberError(
                          /Unauthorized/.test(message)
                            ? "Only a group admin can remove members."
                            : message || "Could not remove member",
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
                </span>
              </div>
            );
          })}
          {memberError && <p className="text-xs text-red-400">{memberError}</p>}

          {/* Leaving, and the succession it may require first. */}
          {!convo.removed && (
            <div className="pt-2 mt-1 border-t border-border/50 space-y-1">
              {wouldStrand ? (
                <>
                  <p className="text-[11px] text-yellow-400/90">
                    You are the only admin — use “Make admin” above before leaving, or nobody could
                    add or remove members again.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  disabled={leaving}
                  className="text-xs text-red-400/80 hover:text-red-400 disabled:opacity-50 transition-colors"
                  onClick={async () => {
                    setMemberError(null);
                    setLeaving(true);
                    try {
                      await leaveConversation(convo.id);
                    } catch (err) {
                      const message = err instanceof Error ? err.message : String(err);
                      setMemberError(
                        /LastAdmin/.test(message)
                          ? "Make someone else an admin before you leave."
                          : message,
                      );
                      setWouldStrand(await leavingWouldStrand(convo.id));
                    } finally {
                      setLeaving(false);
                    }
                  }}
                >
                  {leaving ? "Leaving…" : "Leave conversation"}
                </button>
              )}
            </div>
          )}

          {/* Debug: which devices of each DID are actually in the group. */}
          {devices.size > 0 && (
            <div className="pt-2 mt-1 border-t border-border/50 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary/70">Devices in group</p>
              {[...devices.entries()].map(([mDid, fps]) => (
                <div key={mDid} className="text-[11px] text-text-secondary font-mono truncate">
                  {mDid.slice(0, 20)}… → {fps.map((f) => f.slice(0, 8)).join(", ")}
                </div>
              ))}
            </div>
          )}

          {/* Debug: membership history from the engine's retained op log. */}
          {history.length > 0 && (
            <div className="pt-2 mt-1 border-t border-border/50 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary/70">Membership history</p>
              {history.map((e) => (
                <div key={e.opId} className="text-[11px] text-text-secondary truncate">
                  <span className={e.type === "remove" ? "text-red-400/80" : "text-text-secondary"}>{e.type}</span>{" "}
                  {e.deviceFingerprints.map((f) => f.slice(0, 8)).join(", ")}
                  {e.type !== "create" && ` · by ${e.actorDid.slice(-6)}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MessageList />
      {convo?.removed === true ? (
        <div className="border-t border-border px-4 py-3 text-center text-sm text-text-secondary bg-main shrink-0">
          {convo.left === true
            ? "You left this conversation. Your history stays here, but you can't send new messages."
            : "You were removed from this conversation. You can still read what you already had, but you can't send new messages."}
        </div>
      ) : (
        <MessageComposer />
      )}
    </div>
  );
}
