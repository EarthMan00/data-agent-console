import { ShareReplayPage } from "@/components/share-replay-page";

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <ShareReplayPage shareId={shareId} />;
}
