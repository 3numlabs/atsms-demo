import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export function LoginPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-main px-4">
      <div className="mb-8 text-center">
        {/* The brand mark: a white @ on Signal orange (atsms-brand §4). */}
        <img
          src="/mark.svg"
          alt=""
          width={64}
          height={64}
          className="rounded-2xl mx-auto mb-4"
        />
        {/* The @sms wordmark is the logo form; prose stays ATSMS. */}
        <h1 className="text-3xl font-medium tracking-tight text-text-primary mb-1">
          <span className="text-accent">@</span>sms
        </h1>
        <p className="text-sm text-text-secondary">
          End-to-end encrypted group messaging on AT Protocol
        </p>
      </div>

      <OnboardingFlow />
    </div>
  );
}
