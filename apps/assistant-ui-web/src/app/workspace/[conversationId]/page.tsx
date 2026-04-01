import { ThreadScreen } from "../../../components/thread-screen";

type ConversationPageProps = Readonly<{
  params: Promise<{
    conversationId: string;
  }>;
}>;

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;

  return <ThreadScreen initialConversationId={conversationId} />;
}
