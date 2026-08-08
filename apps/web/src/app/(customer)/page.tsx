import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StationSearchClient } from '@/components/station/station-search-client';
import { DEFAULT_CENTER } from '@/lib/geo';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Find EV charging stations near you',
  description:
    'Search live EV charging availability across India. Filter by connector type, see ₹/kWh pricing and start a charge in one tap.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Find EV charging stations near you · EVRute',
    description: 'Live connector availability, transparent pricing, one-tap charging.',
    url: env.NEXT_PUBLIC_SITE_URL,
  },
};

export default async function MapSearchPage() {
  const supabase = await createSupabaseServerClient();

  const { data: stations } = await supabase.rpc('search_stations', {
    p_lat: DEFAULT_CENTER.lat,
    p_lng: DEFAULT_CENTER.lng,
    p_radius_m: 25_000,
    p_only_available: false,
    p_limit: 60,
    p_offset: 0,
  });

  const initialStations = stations ?? [];

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: initialStations.map((station, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${env.NEXT_PUBLIC_SITE_URL}/station/${station.slug}`,
      name: station.name,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <StationSearchClient initialStations={initialStations} initialCenter={DEFAULT_CENTER} />
    </>
  );
}
