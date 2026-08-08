import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { LiveSessionClient } from '@/components/session/live-session-client';

export const metadata: Metadata = {
  title: 'Charging session',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function LiveSessionPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/session/${id}`)}`);

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle();
  if (!session) notFound();

  const [{ data: station }, { data: connector }] = await Promise.all([
    supabase
      .from('stations')
      .select('name, slug, address_line1, city')
      .eq('id', session.station_id)
      .maybeSingle(),
    supabase
      .from('connectors')
      .select('type, power_kw, connector_number, current_type')
      .eq('id', session.connector_id)
      .maybeSingle(),
  ]);

  return <LiveSessionClient initialSession={session} station={station} connector={connector} />;
}
