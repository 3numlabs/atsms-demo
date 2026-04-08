import { Header } from "./Header";
import { ConversationList } from "@/components/conversations/ConversationList";
import { UserProfile } from "./UserProfile";
import { CallIndicator } from "@/components/call/CallIndicator";

export function Sidebar() {
  return (
    <div className="w-72 h-full flex flex-col bg-sidebar border-r border-border shrink-0">
      <Header />
      <CallIndicator />
      <ConversationList />
      <UserProfile />
    </div>
  );
}
