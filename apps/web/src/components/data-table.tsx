import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ExpandableRow } from '@/components/expandable-row';
import { cn } from '@/lib/utils/cn';

/**
 * Shared server-rendered, URL-driven, paginated table.
 *
 * Deliberately not a client component: pagination and sort state live in
 * the URL query string (`page`, `sort`, `dir`), so a table's state survives
 * a reload, is shareable, and needs no client JS to work. Every screen that
 * lists rows — stations, sessions, settlements, users, tickets, payments,
 * coupons, audit log — renders through this one component.
 */

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  /** Cell content only — `DataTable` supplies the `<td>`. */
  readonly render: (row: T) => ReactNode;
  readonly headerClassName?: string;
  readonly cellClassName?: string;
  readonly sortable?: boolean;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Screen-reader-only `<caption>` describing what the table shows. */
  readonly caption: string;
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  /** Path to build pagination/sort links against, e.g. `/owner/sessions`. */
  readonly basePath: string;
  readonly searchParams: Readonly<Record<string, string | undefined>>;
  readonly sortKey?: string | undefined;
  readonly sortDir?: 'asc' | 'desc' | undefined;
  readonly emptyTitle: string;
  readonly emptyDescription?: string;
  readonly errorMessage?: string | null | undefined;
  /** Row expands to show this when provided — used for settlement line items etc. */
  readonly renderExpanded?: (row: T) => ReactNode;
  readonly getRowLabel?: (row: T) => string;
}

function buildHref(
  basePath: string,
  params: Readonly<Record<string, string | undefined>>,
  overrides: Readonly<Record<string, string | undefined>>,
): string {
  const usp = new URLSearchParams();
  const merged: Record<string, string | undefined> = { ...params, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== '') usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function PageLink({
  basePath,
  searchParams,
  page,
  disabled,
  children,
}: {
  readonly basePath: string;
  readonly searchParams: Readonly<Record<string, string | undefined>>;
  readonly page: number;
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 items-center rounded-lg border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-muted)] opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={buildHref(basePath, searchParams, { page: String(page) })}
      className="inline-flex h-9 items-center rounded-lg border border-[var(--border-strong)] px-3 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {children}
    </Link>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
  sortKey,
  sortDir,
  emptyTitle,
  emptyDescription,
  errorMessage,
  renderExpanded,
  getRowLabel,
}: DataTableProps<T>) {
  if (errorMessage) {
    return (
      <Card>
        <ErrorState title="Couldn't load data" description={errorMessage} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} {...(emptyDescription ? { description: emptyDescription } : {})} />
      </Card>
    );
  }

  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
              {renderExpanded && (
                <th scope="col" className="w-10 px-2 py-3">
                  <span className="sr-only">Expand</span>
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase',
                    col.headerClassName,
                  )}
                >
                  {col.sortable ? (
                    <Link
                      href={buildHref(basePath, searchParams, {
                        sort: col.key,
                        dir: sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc',
                        page: '1',
                      })}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                    >
                      {col.header}
                      {sortKey === col.key && (
                        <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </Link>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cells = columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-middle text-[var(--text-primary)]', col.cellClassName)}>
                  {col.render(row)}
                </td>
              ));

              if (renderExpanded) {
                return (
                  <ExpandableRow
                    key={rowKey(row)}
                    summaryCells={cells}
                    columnCount={columns.length}
                    detail={renderExpanded(row)}
                    label={getRowLabel ? getRowLabel(row) : 'row details'}
                  />
                );
              }

              return (
                <tr key={rowKey(row)} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing <span className="tabular font-medium text-[var(--text-primary)]">{rangeStart}</span>–
          <span className="tabular font-medium text-[var(--text-primary)]">{rangeEnd}</span> of{' '}
          <span className="tabular font-medium text-[var(--text-primary)]">{totalCount}</span>
        </p>
        <nav className="flex items-center gap-2" aria-label="Pagination">
          <PageLink basePath={basePath} searchParams={searchParams} page={page - 1} disabled={page <= 1}>
            Previous
          </PageLink>
          <span className="tabular px-1 text-xs text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          <PageLink basePath={basePath} searchParams={searchParams} page={page + 1} disabled={page >= totalPages}>
            Next
          </PageLink>
        </nav>
      </div>
    </Card>
  );
}

/** Skeleton with the shape of `DataTable`, shown while a page's data is loading. */
export function DataTableSkeleton({
  columnCount = 5,
  rowCount = 8,
  label = 'Loading table data',
}: {
  readonly columnCount?: number;
  readonly rowCount?: number;
  readonly label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Card className="overflow-hidden" aria-hidden="true">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
              {Array.from({ length: columnCount }).map((__, colIndex) => (
                <Skeleton key={colIndex} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
