import React from "react";

/*
  Shared skeleton loaders (lightweight Tailwind shimmer — no heavy UI lib) used
  across the storefront so every data/image area shows a smooth placeholder until
  content is ready, even on slow networks. Replaces the old Ant Design Skeleton
  (antd removed from the bundle for a much smaller download).
*/

const Shimmer = ({ className = "" }) => (
  <div className={`animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/60 ${className}`} aria-hidden="true" />
);

// A single service/product card placeholder (image + title + price row).
export function ServiceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="aspect-[3/4] w-full">
        <Shimmer className="w-full h-full rounded-none" />
      </div>
      <div className="p-3 space-y-2">
        <Shimmer className="h-3.5 w-4/5" />
        <Shimmer className="h-3 w-3/5" />
        <div className="flex items-center justify-between pt-1">
          <Shimmer className="h-5 w-16" />
          <Shimmer className="h-8 w-14 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// A responsive grid of service card skeletons.
export function ServiceGridSkeleton({ count = 8, className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5" }) {
  return (
    <div className={className} data-testid="skeleton-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <ServiceCardSkeleton key={i} />)}
    </div>
  );
}

// Category chips / pills placeholder row.
export function CategoryChipsSkeleton({ count = 6 }) {
  return (
    <div className="flex gap-2 overflow-hidden" data-testid="skeleton-chips" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
  );
}

// Generic list-row placeholders (bookings, purchases, etc.).
export function ListSkeleton({ rows = 4, avatar = true, className = "space-y-3" }) {
  return (
    <div className={className} data-testid="skeleton-list" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          {avatar && <Shimmer className="h-10 w-10 rounded-full shrink-0" />}
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3.5 w-2/5" />
            <Shimmer className="h-3 w-11/12" />
            <Shimmer className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Detail page placeholder (hero image + text block).
export function DetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="skeleton-detail" aria-busy="true">
      <Shimmer className="w-full h-56 sm:h-72 rounded-2xl" />
      <Shimmer className="h-5 w-1/2" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-3 w-full" />)}
      </div>
      <div className="flex gap-3">
        <Shimmer className="h-11 w-32 rounded-lg" />
        <Shimmer className="h-11 w-32 rounded-lg" />
      </div>
    </div>
  );
}

// Simple text/stat block placeholder.
export function BlockSkeleton({ rows = 3, title = true }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" aria-busy="true">
      {title && <Shimmer className="h-4 w-1/3 mb-1" />}
      {Array.from({ length: rows }).map((_, i) => <Shimmer key={i} className="h-3 w-full" />)}
    </div>
  );
}
