import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, BadgeCheck, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_RADIUS_MILES,
  MAX_RADIUS_MILES,
  MIN_RADIUS_MILES,
  fetchListings,
  type Listing,
} from "@/lib/api";
import { cn } from "@/lib/cn";

const ZIP_PATTERN = /^\d{5}$/;

export default function BuyerStorefront() {
  const { slug } = useParams();

  const [zipInput, setZipInput] = useState("");
  const [appliedZip, setAppliedZip] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      fetchListings({ zip: appliedZip || undefined, radiusMiles }, signal)
        .then((result) => setListings(result.listings))
        .catch((caught: Error) => {
          if (caught.name === "AbortError") return;
          setError(caught.message);
          setListings([]);
        })
        .finally(() => setLoading(false));
    },
    [appliedZip, radiusMiles]
  );

  // Refetch whenever the ZIP or the radius changes. The radius slider commits
  // on release rather than on every pixel, so this is not chatty.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const zipIsValid = ZIP_PATTERN.test(zipInput);
  const measuredCount = useMemo(
    () => listings.filter((listing) => listing.priceStatus === "measured").length,
    [listings]
  );

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded bg-[#7c3aed]" />
            <span className="font-bold tracking-tight text-sm">ROOM2STORE</span>
          </div>

          <form
            className="flex-1 max-w-xl"
            onSubmit={(event) => {
              event.preventDefault();
              if (zipIsValid) setAppliedZip(zipInput);
            }}
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={zipInput}
                onChange={(event) => setZipInput(event.target.value.replace(/\D/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="Enter your ZIP code to see what is near you"
                className="w-full h-9 pl-9 pr-20 rounded-md border border-zinc-300 bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:border-[#7c3aed]"
              />
              <button
                type="submit"
                disabled={!zipIsValid}
                className={cn(
                  "absolute right-1 top-1 h-7 px-3 rounded text-xs font-medium transition-colors",
                  zipIsValid
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                )}
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </header>

      <div className="bg-[#f4f4f5] border-b border-zinc-200">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-lg font-bold">Near you</div>
            <div className="text-xs text-zinc-600 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {appliedZip
                ? `Within ${radiusMiles} miles of ${appliedZip} · ${listings.length} items`
                : `${listings.length} items listed · enter a ZIP to filter by distance`}
            </div>
          </div>
          {measuredCount > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-700 bg-white border border-zinc-200 rounded-full px-3 py-1.5">
              <BadgeCheck className="w-4 h-4 text-[#7c3aed]" />
              <span className="font-semibold">{measuredCount}</span> priced by real people
            </div>
          )}
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          <aside>
            <div className="border-b border-zinc-200 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                Distance
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold font-mono tabular-nums">{radiusMiles}</span>
                <span className="text-xs text-zinc-500">miles</span>
              </div>
              <input
                type="range"
                min={MIN_RADIUS_MILES}
                max={MAX_RADIUS_MILES}
                step={5}
                value={radiusMiles}
                onChange={(event) => setRadiusMiles(Number(event.target.value))}
                className="w-full accent-[#7c3aed]"
                aria-label="Search radius in miles"
              />
              <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                <span>{MIN_RADIUS_MILES} mi</span>
                <span>{MAX_RADIUS_MILES} mi</span>
              </div>
              {!appliedZip && (
                <p className="text-[11px] text-zinc-500 mt-3">
                  Enter a ZIP code above to filter by distance.
                </p>
              )}
            </div>
          </aside>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-zinc-600">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
                  </span>
                ) : (
                  <>
                    Showing <span className="font-semibold">{listings.length}</span> items
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {!loading && !error && listings.length === 0 && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-10 text-center">
                <div className="text-sm font-medium text-zinc-700">Nothing listed here yet</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {appliedZip
                    ? `No items within ${radiusMiles} miles of ${appliedZip}. Try widening the radius.`
                    : "Text a photo to the Room2Store number and it will appear here."}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ProductCard key={listing.id} listing={listing} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-zinc-200 mt-12 py-6">
        <div className="max-w-[1200px] mx-auto px-6 text-xs text-zinc-500 text-center">
          Powered by ROOM2STORE · Priced by real people, sold by agents
          {slug && <> · <span className="font-mono">/{slug}</span></>}
        </div>
      </footer>
    </div>
  );
}

function ProductCard({ listing }: { listing: Listing }) {
  const priced = listing.priceStatus === "measured" && listing.price != null;

  return (
    <div className="relative bg-white border border-zinc-200 rounded-lg overflow-hidden transition-all hover:border-[#7c3aed] hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-zinc-100">
        {listing.photoUrl ? (
          <img src={listing.photoUrl} alt={listing.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
            No photo
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="text-[14px] font-semibold leading-snug line-clamp-2 min-h-[36px] mb-1.5">
          {listing.name}
        </div>
        <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700 mb-2">
          {listing.condition}
        </div>

        {/* A price only appears once a study measured one. Until then the card
            says so rather than showing a number nobody stands behind. */}
        <div className="mb-1">
          {priced ? (
            <span className="text-[20px] font-bold font-mono tabular-nums">${listing.price}</span>
          ) : (
            <span className="text-[13px] font-medium text-zinc-500">Price being measured</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500 mb-3">
          <MapPin className="w-3 h-3" />
          {listing.location.city}, {listing.location.state}
          {listing.distanceMiles != null && <> · {listing.distanceMiles} mi away</>}
        </div>

        <div className="space-y-2">
          <button
            disabled={!priced}
            className={cn(
              "w-full h-9 rounded-md text-sm font-medium transition-colors",
              priced
                ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {priced ? "Reserve" : "Awaiting price"}
          </button>
          <Button variant="outline" className="w-full h-9" disabled={!priced}>
            Make offer
          </Button>
        </div>

        <div className="text-[11px] text-zinc-500 mt-2 text-center">Free local pickup</div>
      </div>
    </div>
  );
}
