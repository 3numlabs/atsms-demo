import { Header } from "./Header";
import { ConversationList } from "@/components/conversations/ConversationList";
import { UserProfile } from "./UserProfile";

export function Sidebar() {
  return (
    <div className="w-72 h-full flex flex-col bg-sidebar border-r border-border shrink-0">
      <Header />
      <ConversationList />
      <UserProfile />
    </div>
  );
}
