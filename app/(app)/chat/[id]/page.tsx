import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { getConversation } from '@/lib/db/repositories/conversations';
import { listMessages } from '@/lib/db/repositories/messages';
import { toUIMessages } from '@/lib/ai/ui-messages';
import { Chat } from '@/components/chat/chat';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const conversation = await getConversation(ctx, id);

  return { title: conversation?.title ?? 'Conversación' };
}

export default async function ConversacionPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  const conversation = await getConversation(ctx, id);

  // `getConversation` ya acota por tenant y por persona: una conversación de
  // alguien más no existe desde aquí, no es "prohibida".
  if (!conversation) {
    notFound();
  }

  const rows = await listMessages(ctx, conversation.id);

  return (
    <Chat
      conversationId={conversation.id}
      initialMessages={toUIMessages(rows)}
      isNew={false}
    />
  );
}
