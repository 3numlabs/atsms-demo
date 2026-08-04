import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  resolveHandle,
  reachabilityOf,
  startSecureConversation,
  startNoticeThread,
} from "@/lib/atsms-bridge";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";

interface NewConversationProps {
  open: boolean;
  onClose: () => void;
}

interface Member {
  did: string;
  handle: string;
}

/**
 * Mode selection is deliberate (sdk-shape.md Part A): each recipient's
 * reachability decides what we OFFER, and the user confirms anything weaker
 * than a secure conversation — there is no silent fallback.
 *
 * Groups (2+ recipients) are secure conversations only: every member must be
 * DCGKA-capable (capability §3 — no silent downgrade, and one-shot notices
 * have no group semantics). The one-shot consent flow stays available for a
 * single recipient.
 */
export function NewConversation({ open, onClose }: NewConversationProps) {
  const [handle, setHandle] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [groupName, setGroupName] = useState("");
  /** One person can still be a GROUP — a two-person group is a real thing,
   *  distinct from the DM with that person. Explicit, never inferred. */
  const [forceGroup, setForceGroup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeOffer, setNoticeOffer] = useState<Member | null>(null);
  const setActive = useConversationStore((s) => s.setActive);
  const addOrUpdateConversation = useConversationStore(
    (s) => s.addOrUpdateConversation,
  );
  const did = useAuthStore((s) => s.did);
  const myHandle = useAuthStore((s) => s.handle);

  /** Resolve + vet the typed handle; returns the member if addable. */
  async function vetHandle(): Promise<Member | "notice-offered" | null> {
    const cleanHandle = handle.trim().replace(/^@/, "");
    if (cleanHandle === "") return null;
    if (members.some((m) => m.handle === cleanHandle)) {
      setError(`@${cleanHandle} is already in the list`);
      return null;
    }

    const { did: recipientDid } = await resolveHandle(cleanHandle);
    const reachability = await reachabilityOf(recipientDid);

    if (reachability === "unreachable") {
      setError(
        `@${cleanHandle} hasn't set up AT-SMS yet — nothing can be delivered to them.`,
      );
      return null;
    }

    if (reachability === "one-shot") {
      if (members.length === 0) {
        // Weaker surface — offer it explicitly, don't just proceed.
        setNoticeOffer({ did: recipientDid, handle: cleanHandle });
        return "notice-offered";
      }
      setError(
        `@${cleanHandle} can't join a group — they only support basic messages ` +
          `(no secure conversations yet). Groups need every member secure-capable.`,
      );
      return null;
    }

    return { did: recipientDid, handle: cleanHandle };
  }

  /** Add the typed handle to the member list (group building). */
  async function handleAdd() {
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    setNoticeOffer(null);
    try {
      const vetted = await vetHandle();
      if (vetted !== null && vetted !== "notice-offered") {
        setMembers([...members, vetted]);
        setHandle("");
      }
    } catch (err: any) {
      setError(err.message || "Could not find that user");
    } finally {
      setLoading(false);
    }
  }

  /** Start the conversation: pending input counts as the last member. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNoticeOffer(null);

    try {
      let roster = members;
      if (handle.trim() !== "") {
        const vetted = await vetHandle();
        if (vetted === "notice-offered") return; // consent card takes over
        if (vetted === null) return; // error shown
        roster = [...members, vetted];
        setMembers(roster);
        setHandle("");
      }
      if (roster.length === 0) return;

      // One person and no name ⇒ the DM with them (reused if it exists).
      // Naming it, or picking several people, means a group — a new one every
      // time, since the same people may share any number of groups.
      const wantsGroup = roster.length >= 2 || forceGroup;
      const title = wantsGroup ? groupName : undefined;
      const convoId = await startSecureConversation(
        roster.map((m) => m.did),
        title,
        wantsGroup ? "group" : "dm",
      );
      activateThread(convoId, roster, title);
    } catch (err: any) {
      setError(err.message || "Could not start the conversation");
    } finally {
      setLoading(false);
    }
  }

  async function startNotice(recipient: Member) {
    setLoading(true);
    try {
      const convoId = await startNoticeThread(recipient.did);
      activateThread(convoId, [recipient]);
    } catch (err: any) {
      setError(err.message || "Could not start the thread");
    } finally {
      setLoading(false);
    }
  }

  function activateThread(convoId: string, roster: Member[], title?: string) {
    addOrUpdateConversation({
      id: convoId,
      participantDids: [did!, ...roster.map((m) => m.did)],
      participantHandles: [myHandle!, ...roster.map((m) => m.handle)],
      ...(title !== undefined && title.trim() !== ""
        ? { title: title.trim() }
        : {}),
      lastMessage: undefined,
      lastMessageAt: undefined,
      unreadCount: 0,
    });

    setActive(convoId);
    resetState();
    onClose();
  }

  function resetState() {
    setHandle("");
    setMembers([]);
    setGroupName("");
    setForceGroup(false);
    setError(null);
    setNoticeOffer(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Message">
      <form onSubmit={handleSubmit} className="space-y-4">
        {members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span
                key={m.did}
                className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-text-primary text-xs px-2.5 py-1"
              >
                @{m.handle}
                <button
                  type="button"
                  aria-label={`Remove ${m.handle}`}
                  className="text-text-secondary hover:text-text-primary"
                  onClick={() =>
                    setMembers(members.filter((x) => x.did !== m.did))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={
              members.length === 0
                ? "@handle.bsky.social"
                : "Add another member…"
            }
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setError(null);
              setNoticeOffer(null);
            }}
            error={error || undefined}
            autoFocus
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 self-start"
            loading={loading && handle.trim() !== ""}
            disabled={!handle.trim()}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>

        {(members.length >= 2 || forceGroup) && (
          <Input
            type="text"
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}
        {members.length <= 1 && !forceGroup && (
          <button
            type="button"
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => setForceGroup(true)}
          >
            Make this a group instead (you can add more people later)
          </button>
        )}

        {noticeOffer && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-2">
            <p className="text-sm text-yellow-400">
              @{noticeOffer.handle} can only receive basic encrypted messages
              (no forward secrecy, no calls) — like certified mail, not a
              secure conversation. Send anyway?
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                className="text-xs"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="text-xs"
                loading={loading}
                onClick={() => startNotice(noticeOffer)}
              >
                Send basic messages
              </Button>
            </div>
          </div>
        )}

        {!noticeOffer && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading && handle.trim() === ""}
              disabled={members.length === 0 && !handle.trim()}
            >
              {members.length >= 2 || forceGroup ? "Create Group" : "Start Chat"}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
