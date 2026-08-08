import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardBody, EmptyState, ErrorState } from '@/components/ui';
import { ReviewReplyForm } from '@/components/forms/review-reply-form';
import { replyToReviewAction } from './actions';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';
import type { EntityActionState } from '@/lib/entity-action-state';

export const metadata: Metadata = { title: 'Reviews' };

function Stars({ rating }: { readonly rating: number }) {
  return (
    <span aria-hidden="true" className="text-warning-500">
      {'★'.repeat(rating)}
      <span className="text-[var(--border-strong)]">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export default async function OwnerReviewsPage() {
  await requireRole('owner', 'admin');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Reviews</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">What drivers are saying about your stations.</p>
      </div>
      <Suspense fallback={<Card><CardBody><div className="skeleton h-40 rounded-xl" /></CardBody></Card>}>
        <ReviewsList />
      </Suspense>
    </div>
  );
}

async function ReviewsList() {
  const user = await requireRole('owner', 'admin');
  const supabase = await createSupabaseServerClient();

  const { data: stations } = await supabase.from('stations').select('id, name').eq('owner_id', user.id);
  const stationIds = (stations ?? []).map((s) => s.id);
  const stationNames = new Map((stations ?? []).map((s) => [s.id, s.name]));

  if (stationIds.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No stations yet" description="Add a station to start receiving reviews." />
        </CardBody>
      </Card>
    );
  }

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('id, station_id, rating, comment, owner_reply, replied_at, created_at, profiles(full_name)')
    .in('station_id', stationIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !reviews) {
    return (
      <Card>
        <CardBody>
          <ErrorState title="Couldn't load reviews" {...(error?.message ? { description: error.message } : {})} />
        </CardBody>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No reviews yet" description="Reviews appear here once drivers rate a completed session." />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reviews.map((review) => {
        const boundAction = replyToReviewAction.bind(null, review.id) as (
          state: EntityActionState,
          formData: FormData,
        ) => Promise<EntityActionState>;
        return (
          <Card key={review.id}>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {review.profiles?.full_name || 'A customer'} · {stationNames.get(review.station_id) ?? 'Station'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatDate(review.created_at)}</p>
                </div>
                <Stars rating={review.rating} />
              </div>
              {review.comment && <p className="mt-2 text-sm text-[var(--text-secondary)]">{review.comment}</p>}
              <ReviewReplyForm action={boundAction} existingReply={review.owner_reply} />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
