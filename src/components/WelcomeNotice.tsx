/**
 * First-run notice. Shown before anything else, once per browser profile, and
 * acknowledged in localStorage.
 *
 * The point is informed consent, not a legal shield: a visitor should know
 * before they sign in that this is unaudited, that their messages live only in
 * this browser, that a relay we run sees their delivery metadata, and that
 * signing in writes real records to their real AT Protocol identity. Everything
 * here is stated plainly, without protocol jargon a visiting developer would
 * have to look up.
 *
 * Bump ACK_KEY if the terms change materially enough that a previous
 * acknowledgement should not carry over.
 */

const ACK_KEY = "atsms_demo_notice_ack_v1";

export function hasAcknowledgedNotice(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) !== null;
  } catch {
    return false; // storage blocked (private mode): show it every time
  }
}

export function WelcomeNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  const accept = () => {
    try {
      localStorage.setItem(ACK_KEY, new Date().toISOString());
    } catch {
      /* storage blocked — they will see this again, which is the safe failure */
    }
    onAcknowledge();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-main">
      <div className="min-h-full flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl p-6 md:p-8">
          <h1 className="text-2xl font-semibold text-text-primary">Welcome to the ATSMS demo</h1>
          <p className="mt-3 text-text-secondary">
            <strong className="text-text-primary">This is a proof-of-concept.</strong> It exists to show that
            the protocol works and to give developers something real to test a client against — not to be a
            messenger you rely on.
          </p>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            What you're looking at
          </h2>
          <p className="mt-2 text-text-secondary">
            End-to-end encrypted messaging and calls built on <strong className="text-text-primary">AT
            Protocol identities</strong>, with group encryption from <strong className="text-text-primary">
            BeeKEM</strong>, a concurrent-TreeKEM design by{" "}
            <a
              href="https://www.inkandswitch.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              Ink &amp; Switch
            </a>
            . BeeKEM solves something genuinely hard: keeping a group's keys in agreement when several people
            change the group at the same time, with no server ordering their changes. Their research made this
            possible, and we're grateful for it — the tree beneath our key agreement is a faithful port of
            their work. Any mistakes in what's built on top are ours.
          </p>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Please read before you start
          </h2>
          <ul className="mt-2 space-y-3 text-text-secondary">
            <li>
              <strong className="text-text-primary">Your messages live only in this browser.</strong> Clearing
              site data, using a private window, or letting the browser evict storage deletes them
              permanently. There is no server-side copy to restore from — that's the design, not an omission.
            </li>
            <li>
              <strong className="text-text-primary">No independent security review yet.</strong> The
              cryptography has not been audited. An external review is required before any of this carries
              real traffic, and it hasn't happened. Treat every message here as unprotected.
            </li>
            <li>
              <strong className="text-text-primary">Don't send anything that matters.</strong> No real
              secrets, no personal information, nothing you'd mind seeing in a debug log.
            </li>
            <li>
              <strong className="text-text-primary">Things will break.</strong> Known rough edges are tracked
              openly, and you may hit ones we haven't found. Losing a conversation is a normal outcome of a
              test session.
            </li>
            <li>
              <strong className="text-text-primary">Messages route through a relay run by 3NUM.</strong> It's
              a reference implementation of an ATSMS relay node, running on Cloudflare Workers. It holds
              sealed envelopes only until your device collects them, and it cannot read them — but it does see
              who is receiving mail and when. Nothing about the protocol requires <em>this</em> relay: it's
              meant to be one of many, and you can run your own.
            </li>
            <li>
              <strong className="text-text-primary">Your identity is a real one.</strong> You sign in with a
              real AT Protocol account, and the demo publishes a device certificate and keys to your repo.
              They're removable, but they are real records under your DID.
            </li>
            <li>
              <strong className="text-text-primary">Sign-in here is for the demo only.</strong> The passkey
              flow is a stand-in so you can try this in a browser; it is not the identity model the product
              will use.
            </li>
          </ul>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Who this is for
          </h2>
          <p className="mt-2 text-text-secondary">
            Developers who want to test a client against a working ATSMS implementation, and anyone curious
            how a decentralized encrypted messenger fits together. If that's you, the source and the
            specifications are open.
          </p>

          <button
            type="button"
            onClick={accept}
            className="mt-8 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white transition-opacity hover:opacity-90"
          >
            I understand — continue
          </button>
        </div>
      </div>
    </div>
  );
}
