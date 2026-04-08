import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  resolveHandle,
  getDMConvoId,
  getStorageManager,
  getCurrentDid,
} from "@/lib/atsms-bridge";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";

interface NewConversationProps {
  open: boolean;
  onClose: () => void;
}

export function NewConversation({ open, onClose }: NewConversationProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    try {
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
      const { did: recipientDid } = await resolveHandle(cleanHandle);
      const convoId = await getDMConvoId(recipientDid);

      // Create the conversation in storage if it doesn't exist
      const sm = getStorageManager();
      if (sm) {
        const existing = await sm.getConversation(convoId);
        if (!existing) {
          await sm.getOrCreateConversation([
            getCurrentDid()!,
            recipientDid,
          ]);
        }
      }

      // Add to the conversation store so the UI shows it immediately
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
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not find that user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Message">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="@handle.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={error || undefined}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Start Chat
          </Button>
        </div>
      </form>
    </Modal>
  );
}
