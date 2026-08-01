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

/**
 * Mode selection is deliberate (sdk-shape.md Part A): the recipient's
 * reachability decides what we OFFER, and the user confirms anything weaker
 * than a secure conversation — there is no silent fallback.
 */
export function NewConversation({ open, onClose }: NewConversationProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeOffer, setNoticeOffer] = useState<{
    did: string;
    handle: string;
  } | null>(null);
  const setActive = useConversationStore((s) => s.setActive);
  const addOrUpdateConversation = useConversationStore(
    (s) => s.addOrUpdateConversation,
  );
  const did = useAuthStore((s) => s.did);
  const myHandle = useAuthStore((s) => s.handle);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);
    setNoticeOffer(null);

    try {
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
      const { did: recipientDid } = await resolveHandle(cleanHandle);

      const reachability = await reachabilityOf(recipientDid);

      if (reachability === "unreachable") {
        setError(
          `@${cleanHandle} hasn't set up AT-SMS yet — nothing can be delivered to them.`,
        );
        return;
      }

      if (reachability === "one-shot") {
        // Weaker surface — offer it explicitly, don't just proceed.
        setNoticeOffer({ did: recipientDid, handle: cleanHandle });
        return;
      }

      await activateThread(
        await startSecureConversation(recipientDid),
        recipientDid,
        cleanHandle,
      );
    } catch (err: any) {
      setError(err.message || "Could not find that user");
    } finally {
      setLoading(false);
    }
  }

  async function startNotice(recipientDid: string, cleanHandle: string) {
    setLoading(true);
    try {
      await activateThread(
        await startNoticeThread(recipientDid),
        recipientDid,
        cleanHandle,
      );
    } catch (err: any) {
      setError(err.message || "Could not start the thread");
    } finally {
      setLoading(false);
    }
  }

  async function activateThread(
    convoId: string,
    recipientDid: string,
    cleanHandle: string,
  ) {
    addOrUpdateConversation({
      id: convoId,
      participantDids: [did!, recipientDid],
      participantHandles: [myHandle!, cleanHandle],
      lastMessage: undefined,
      lastMessageAt: undefined,
      unreadCount: 0,
    });

    setActive(convoId);
    setHandle("");
    setNoticeOffer(null);
    onClose();
  }

  function handleClose() {
    setHandle("");
    setError(null);
    setNoticeOffer(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Message">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="@handle.bsky.social"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setNoticeOffer(null);
          }}
          error={error || undefined}
          autoFocus
        />

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
                onClick={() => startNotice(noticeOffer.did, noticeOffer.handle)}
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
            <Button type="submit" loading={loading}>
              Start Chat
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
