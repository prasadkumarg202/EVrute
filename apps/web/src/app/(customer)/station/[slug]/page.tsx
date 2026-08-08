import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Database } from '@evrute/db/types';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { StationDetailClient } from '@/components/station/station-detail-client';

export const revalidate = 0;

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}

type ConnectorDetailRow = Database['public']['Views']['connector_details']['Row'];

async function loadStation(slug: string) {
  const supabase = await createSupabaseServerClient();

  const { data: station } = await supabase.from('stations').select('*').eq('slug', slug).maybeSingle();
  if (!station) return null;

  const [{ data: connectors }, { data: tariffs }, { data: reviews }] = await Promise.all([
    supabase
      .from('connector_details')
      .select('*')
      .eq('station_id', station.id)
      .order('charger_label', { ascending: true })
      .order('connector_number', { ascending: true }),
    supabase.from('tariffs').select('*').eq('station_id', station.id),
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, owner_reply, replied_at')
      .eq('station_id', station.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  return {
    station,
    connectors: (connectors ?? []) as ConnectorDetailRow[],
    tariffs: tariffs ?? [],
    reviews: reviews ?? [],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStation(slug);
  if (!data) return { title: 'Station not found' };

  const { station } = data;
  const title = `${station.name} — EV charging in ${station.city}`;
  const description = `${station.name} at ${station.address_line1}, ${station.city}. ${
    station.rating_count > 0 ? `Rated ${station.rating_avg.toFixed(1)}/5 from ${station.rating_count} charges. ` : ''
  }View live connector availability and pricing before you drive over.`;

  return {
    title,
    description,
    alternates: { canonical: `/station/${station.slug}` },
    openGraph: {
      title,
      description,
      url: `${env.NEXT_PUBLIC_SITE_URL}/station/${station.slug}`,
      images: station.photos[0] ? [{ url: station.photos[0] }] : undefined,
    },
  };
}

export default async function StationDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadStation(slug);
  if (!data || data.station.status !== 'active') notFound();

  const { station, connectors, tariffs, reviews } = data;
  const user = await getSessionUser();

  let vehicles: Awaited<ReturnType<typeof loadUserExtras>>['vehicles'] = [];
  let spendableBalance = 0;
  if (user) {
    const extras = await loadUserExtras();
    vehicles = extras.vehicles;
    spendableBalance = extras.spendableBalance;
  }

  const placeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: station.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: station.address_line1,
      addressLocality: station.city,
      addressRegion: station.state,
      postalCode: station.postal_code ?? undefined,
      addressCountry: station.country_code,
    },
    geo: { '@type': 'GeoCoordinates', latitude: station.lat, longitude: station.lng },
    aggregateRating:
      station.rating_count > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: station.rating_avg,
            reviewCount: station.rating_count,
          }
        : undefined,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Find a charger', item: env.NEXT_PUBLIC_SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: station.name,
        item: `${env.NEXT_PUBLIC_SITE_URL}/station/${station.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <StationDetailClient
        station={station}
        connectors={connectors}
        tariffs={tariffs}
        reviews={reviews}
        vehicles={vehicles}
        isSignedIn={user !== null}
        spendableBalance={spendableBalance}
      />
    </>
  );
}

async function loadUserExtras() {
  const supabase = await createSupabaseServerClient();
  const [{ data: vehicles }, { data: balance }] = await Promise.all([
    supabase.from('vehicles').select('*').order('is_primary', { ascending: false }),
    supabase.rpc('my_spendable_balance'),
  ]);
  return { vehicles: vehicles ?? [], spendableBalance: balance ?? 0 };
}
