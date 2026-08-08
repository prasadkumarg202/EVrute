import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Every active station slug, plus the static top-level routes. Station
 * pages are the pages actually worth indexing — the wallet, history and
 * vehicle screens are behind auth and excluded via robots.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = env.NEXT_PUBLIC_SITE_URL;
  const supabase = await createSupabaseServerClient();

  const { data: stations } = await supabase
    .from('stations')
    .select('slug, updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(5000);

  const stationEntries: MetadataRoute.Sitemap = (stations ?? []).map((station) => ({
    url: `${site}/station/${station.slug}`,
    lastModified: new Date(station.updated_at),
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  return [
    { url: site, lastModified: new Date(), changeFrequency: 'always', priority: 1 },
    { url: `${site}/login`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    ...stationEntries,
  ];
}
