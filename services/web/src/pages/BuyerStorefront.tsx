import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Search, BadgeCheck, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { campaign, items } from "@/data/mock";
import { cn } from "@/lib/cn";

export default function BuyerStorefront() {
  const { slug } = useParams();

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const availableCount = items.filter((i) => !i.soldOverride).length;
  const totalVerified = items.reduce((s, i) => s + i.buyersVerified, 0);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded bg-[#7c3aed]" />
            <span className="font-bold tracking-tight text-sm">
              ROOM2STORE
            </span>
          </div>
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                readOnly
                placeholder="Search this store"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-zinc-300 bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:border-[#7c3aed]"
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-3 h-8 rounded-full border border-zinc-200 bg-zinc-50 text-xs">
            <span className="font-semibold">{campaign.seller}</span>
            <span className="text-zinc-400">·</span>
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{campaign.sellerRating}</span>
            <span className="text-zinc-400">·</span>
            <span>{campaign.positive} positive</span>
          </div>
        </div>
      </header>

      <div className="bg-[#f4f4f5] border-b border-zinc-200">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-lg font-bold">{campaign.storeName}</div>
            <div className="text-xs text-zinc-600 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" /> {campaign.location} ·{" "}
              {availableCount} items available
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-700 bg-white border border-zinc-200 rounded-full px-3 py-1.5">
            <BadgeCheck className="w-4 h-4 text-[#7c3aed]" />
            Prices verified by{" "}
            <span className="font-semibold">{totalVerified} real people</span>
          </div>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          <aside className="hidden md:block">
            <FilterGroup title="Category" options={["Furniture", "Electronics", "Home", "Books", "Clothing"]} />
            <FilterGroup title="Condition" options={["New", "Like New", "Excellent", "Good", "Fair"]} />
            <div className="border-b border-zinc-200 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                Price
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input
                  readOnly
                  value="$0"
                  className="w-16 h-8 rounded border border-zinc-300 px-2"
                />
                <span className="text-zinc-400">to</span>
                <input
                  readOnly
                  value="$500"
                  className="w-16 h-8 rounded border border-zinc-300 px-2"
                />
              </div>
              <input
                type="range"
                className="w-full mt-3 accent-[#7c3aed]"
                defaultValue={40}
              />
            </div>
            <FilterGroup title="Delivery" options={["Local pickup", "Ships nationwide"]} />
          </aside>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-zinc-600">
                Showing <span className="font-semibold">{items.length}</span>{" "}
                items
              </div>
              <select className="h-8 text-xs border border-zinc-300 rounded px-2 bg-white">
                <option>Best match</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
                <option>Newest</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((it) => (
                <ProductCard key={it.id} item={it} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-zinc-200 mt-12 py-6">
        <div className="max-w-[1200px] mx-auto px-6 text-xs text-zinc-500 text-center">
          Powered by ROOM2STORE · Priced by real people, sold by agents ·{" "}
          <span className="font-mono">/{slug}</span>
        </div>
      </footer>
    </div>
  );
}

function FilterGroup({
  title,
  options,
}: {
  title: string;
  options: string[];
}) {
  return (
    <div className="border-b border-zinc-200 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
        {title}
      </div>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o}
            className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer hover:text-zinc-900"
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-[#7c3aed]"
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

function ProductCard({ item }: { item: (typeof items)[number] }) {
  const sold = item.soldOverride || item.status === "sold";
  const showStrike = item.naivePrice > item.measuredPrice;

  return (
    <div
      className={cn(
        "relative bg-white border border-zinc-200 rounded-lg overflow-hidden group transition-all",
        !sold && "hover:border-[#7c3aed] hover:shadow-md"
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-100">
        <img
          src={item.image}
          alt={item.name}
          className={cn(
            "w-full h-full object-cover",
            sold && "grayscale opacity-70"
          )}
        />
        {sold && (
          <div className="absolute top-3 -left-10 w-40 rotate-[-35deg] bg-red-600 text-white text-center text-xs font-bold py-1 shadow-lg tracking-widest">
            SOLD
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="text-[14px] font-semibold leading-snug line-clamp-2 min-h-[36px] mb-1.5">
          {item.name}
        </div>
        <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700 mb-2">
          {item.condition}
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[20px] font-bold font-mono tabular-nums">
            ${item.measuredPrice}
          </span>
          {showStrike && (
            <span className="text-xs text-zinc-400 line-through font-mono">
              ${item.naivePrice}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500 mb-3">
          <BadgeCheck className="w-3 h-3 text-[#7c3aed]" />
          Verified · {item.buyersVerified} buyers
        </div>

        <div className="space-y-2">
          <button
            disabled={sold}
            className={cn(
              "w-full h-9 rounded-md text-sm font-medium transition-colors",
              sold
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            )}
          >
            {sold ? "Sold" : "Reserve"}
          </button>
          <Button
            variant="outline"
            className="w-full h-9"
            disabled={sold}
          >
            Make offer
          </Button>
        </div>

        {item.freeLocalPickup && (
          <div className="text-[11px] text-zinc-500 mt-2 text-center">
            Free local pickup
          </div>
        )}
      </div>
    </div>
  );
}
