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
  messageSenders,
  pendingMembers,
  reinviteMember,
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
  // §8.2: who may never have received their invitation, and who has joined but
  // never said anything. Different facts — the first is a delivery question the
  // protocol can answer, the second is just behaviour.
  const [pending, setPending] = useState<string[]>([]);
  const [senders, setSenders] = useState<Set<string>>(new Set());
  const [reinviting, setReinviting] = useState<string | null>(null);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const setActive = useConversationStore((s) => s.setActive);
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const messageCount = useMessageStore((s) => s.messages.length);
  const did = useAuthStore((s) => s.did);
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const convo = conversations.find((c) => c.id === activeConvoId);

  // Kind is fixed at creation; the count fallback is only for records that
  // predate it (wiped before testing, so it should never be hit).
  const isGroup = convo?.kind !== undefined ? convo.kind === "group" : (convo?.participantDids.length ?? 0) > 2;
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

  // Membership history + per-DID device inventory + who we have heard from: all
  // derived from the engine, so the panel has to re-ask. A new message is one
  // trigger, but not the only one — a member's first sign of life is often a
  // control frame (their healing update), which changes no visible state at all.
  // So poll while the panel is open. It is a local read, and this is a debug
  // surface: a few seconds of staleness reads as a bug, as it did live.
  useEffect(() => {
    if (!activeConvoId || !showMembers) return;
    const refresh = () => {
      void memberDevices(activeConvoId).then(setDevices);
      void membershipHistory(activeConvoId).then(setHistory);
      void leavingWouldStrand(activeConvoId).then(setWouldStrand);
      void conversationAdmins(activeConvoId).then(setAdmins);
      void pendingMembers(activeConvoId).then(setPending);
      void messageSenders(activeConvoId).then(setSenders);
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [activeConvoId, showMembers, convo?.participantDids.length, messageCount]);

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
      {showMembers && convo && !isGroup && (
        <div className="border-b border-border bg-main px-4 py-2 text-[11px] text-text-secondary shrink-0">
          A direct conversation is just the two of you — adding someone starts a
          new group instead, and this one stays as it is.
        </div>
      )}
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
                  {!isSelf && pending.includes(mDid) && (
                    <span
                      className="ml-1 text-[10px] uppercase tracking-wide text-amber-400/90"
                      title={
                        "On the roster, but nothing has ever been heard from them — not even the update a " +
                        "device sends when it joins. Their invitation may never have arrived. Nothing is " +
                        "acknowledged at this layer, so this looks identical to someone who is simply quiet " +
                        "or who declined."
                      }
                    >
                      invited
                    </span>
                  )}
                  {!isSelf && !pending.includes(mDid) && !senders.has(mDid) && (
                    <span
                      className="ml-1 text-[10px] uppercase tracking-wide text-text-secondary/60"
                      title="Joined and reading: their device is in the group and has sent protocol traffic, but no messages."
                    >
                      lurking
                    </span>
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
                {!isSelf && !convo.removed && pending.includes(mDid) && (
                  <button
                    type="button"
                    disabled={reinviting !== null}
                    title="Re-send their admission material: the original create for a founding member, a freshly rebuilt welcome for a later joiner."
                    onClick={async () => {
                      setMemberError(null);
                      setReinviting(mDid);
                      try {
                        await reinviteMember(convo.id, mDid);
                      } catch (err) {
                        setMemberError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setReinviting(null);
                      }
                    }}
                    className="text-accent/90 hover:text-accent disabled:opacity-50 transition-colors"
                  >
                    {reinviting === mDid ? "Re-inviting…" : "Re-invite"}
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
