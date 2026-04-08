export function PasskeyBlocker() {
  return (
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-danger/20 flex items-center justify-center mx-auto">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-danger"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary">
        Browser Not Supported
      </h3>
      <p className="text-sm text-text-secondary max-w-sm mx-auto">
        ATSMS requires the Passkey PRF extension for secure key derivation.
        Your current browser or authenticator does not support this feature.
      </p>
      <p className="text-sm text-text-secondary">
        Please try Chrome 132+ or Edge 132+ with a compatible authenticator.
      </p>
    </div>
  );
}
