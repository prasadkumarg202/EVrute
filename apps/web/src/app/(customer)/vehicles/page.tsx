import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { VehiclesClient } from '@/components/vehicles/vehicles-client';

export const metadata: Metadata = {
  title: 'Your vehicles',
  robots: { index: false, follow: false },
};

export default async function VehiclesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=%2Fvehicles');

  const supabase = await createSupabaseServerClient();
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  return <VehiclesClient vehicles={vehicles ?? []} />;
}
