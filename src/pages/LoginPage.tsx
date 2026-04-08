import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export function LoginPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-main px-4">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-1">ATSMS</h1>
        <p className="text-sm text-text-secondary">
          End-to-end encrypted messaging on AT Protocol
        </p>
      </div>

      <OnboardingFlow />
    </div>
  );
}
