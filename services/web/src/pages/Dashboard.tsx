import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  DollarSign,
  Users,
  PackageCheck,
  ShieldAlert,
  Pause,
  Play,
  ExternalLink,
  BadgeCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  buyerEvents,
  campaign,
  demandCurve,
  feedMessages,
  items,
  listingMetrics,
} from "@/data/mock";
import { cn } from "@/lib/cn";

const kindStyles: Record<string, string> = {
  info: "text-text-secondary",
  gate: "text-warning",
  success: "text-success",
  warning: "text-warning",
  veto: "text-danger",
};

export default function Dashboard() {
  const { campaignId } = useParams();
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState("curve");
  const [sandboxRunning, setSandboxRunning] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const [visibleFeed, setVisibleFeed] = useState(feedMessages.slice(0, 8));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (visibleFeed.length >= feedMessages.length) return;
    const t = setTimeout(() => {
      setVisibleFeed((v) => feedMessages.slice(0, v.length + 1));
    }, 1800);
    return () => clearTimeout(t);
  }, [visibleFeed]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [visibleFeed]);

  const totalRevenue = items
    .filter((i) => i.soldOverride || i.status === "sold")
    .reduce((s, i) => s + i.measuredPrice, 0);

  const stats = [
    {
      label: "Real revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      accent: true,
    },
    { label: "Items live", value: `${items.filter((i) => i.status !== "draft").length}`, icon: PackageCheck },
    { label: "Humans on panel", value: "104", icon: Users },
    { label: "Buyers contacted", value: "12", icon: Activity },
    { label: "Vetoed", value: "1", icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="border-b border-border bg-surface1 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-accent" />
              <span className="font-bold tracking-tight">ROOM2STORE</span>
            </div>
            <span className="text-text-muted">/</span>
            <span className="text-sm text-text-secondary font-mono">
              {campaignId}
            </span>
            <Badge variant="success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulseDot" />
              live
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Toggle pressed={dark} onPressedChange={setDark}>
              {dark ? "Dark" : "Light"}
            </Toggle>
            <Link to={`/store/${campaign.slug}`}>
              <Button variant="outline" size="sm">
                View storefront <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stats.map((s) => (
            <Card
              key={s.label}
              className={cn(s.accent && "border-accent/40 bg-accent-soft/20")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wide text-text-muted">
                    {s.label}
                  </span>
                  <s.icon className="w-4 h-4 text-text-muted" />
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums">
                  {s.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-6">
          <div className="space-y-6 min-w-0">
            <Card>
              <CardHeader className="flex items-center justify-between flex-row">
                <div>
                  <CardTitle>Pricing science</CardTitle>
                  <p className="text-xs text-text-muted mt-1">
                    Naive comps guess vs measured demand curve for the office
                    chair.
                  </p>
                </div>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList>
                    <TabsTrigger value="curve">Demand curve</TabsTrigger>
                    <TabsTrigger value="lift">V1 vs V2</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsContent value="curve">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={demandCurve}>
                          <defs>
                            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="price"
                            stroke="var(--text-muted)"
                            tickFormatter={(v) => `$${v}`}
                            fontSize={11}
                          />
                          <YAxis
                            stroke="var(--text-muted)"
                            tickFormatter={(v) => `${v}%`}
                            fontSize={11}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--surface2)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(v: number, k: string) =>
                              k === "probability" ? `${v}%` : v
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="probability"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            fill="url(#fill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                      <div>
                        <div className="text-xs text-text-muted">Naive price</div>
                        <div className="text-lg font-mono font-bold line-through text-text-muted">
                          $180
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-text-muted">Measured price</div>
                        <div className="text-lg font-mono font-bold text-accent">
                          $145
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-text-muted">
                          Floor (75% p)
                        </div>
                        <div className="text-lg font-mono font-bold">$118</div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="lift">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={listingMetrics}>
                          <CartesianGrid
                            stroke="var(--border)"
                            strokeDasharray="3 3"
                          />
                          <XAxis
                            dataKey="label"
                            stroke="var(--text-muted)"
                            fontSize={11}
                          />
                          <YAxis stroke="var(--text-muted)" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              background: "var(--surface2)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="v1" name="V1 listing" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="v2" name="V2 listing" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-text-muted mt-4">
                      Same price, fresh panel, rewritten copy. Study B held
                      price constant to isolate listing-quality lift.
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Item catalog</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-text-muted uppercase tracking-wide bg-surface2">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Item</th>
                      <th className="text-left px-4 py-2 font-medium">
                        Category
                      </th>
                      <th className="text-right px-4 py-2 font-medium">Naive</th>
                      <th className="text-right px-4 py-2 font-medium">
                        Measured
                      </th>
                      <th className="text-right px-4 py-2 font-medium">Floor</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr
                        key={it.id}
                        className="border-t border-border hover:bg-surface2/50"
                      >
                        <td className="px-4 py-3 font-medium">{it.name}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {it.category}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-text-muted line-through">
                          ${it.naivePrice}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-accent">
                          ${it.measuredPrice}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          ${it.floorPrice}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              it.status === "sold"
                                ? "success"
                                : it.status === "reserved"
                                ? "warning"
                                : "accent"
                            }
                          >
                            {it.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 min-w-0">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulseDot" />
                  <CardTitle>Band feed</CardTitle>
                </div>
                <span className="text-xs text-text-muted font-mono">
                  {visibleFeed.length}/{feedMessages.length}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  ref={feedRef}
                  className="max-h-80 overflow-y-auto no-scrollbar divide-y divide-border"
                >
                  {visibleFeed.map((m) => (
                    <div
                      key={m.id}
                      className="px-4 py-2 text-xs animate-fadeSlide"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-text-muted">
                          {m.ts}
                        </span>
                        <Badge variant="muted">{m.agent}</Badge>
                      </div>
                      <div className={cn("leading-snug", kindStyles[m.kind])}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Buyer activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {buyerEvents.map((e) => (
                    <div
                      key={e.id}
                      className="px-4 py-2 text-xs flex items-center gap-3"
                    >
                      <span className="font-mono text-text-muted">{e.ts}</span>
                      <span className="font-medium">{e.handle}</span>
                      <span className="text-text-secondary flex-1 truncate">
                        {e.action}
                        {e.item && (
                          <span className="text-text-muted"> · {e.item}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Superserve sandbox</CardTitle>
                <Badge variant={sandboxRunning ? "success" : "muted"}>
                  {sandboxRunning ? "running" : "paused"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-text-secondary mb-3">
                  Pauses between bursts, resumes when a buyer texts. Compute
                  billed only while active.
                </div>
                <div className="flex items-center gap-2 mb-3 text-xs font-mono">
                  <span className="text-text-muted">sbx_9b2f</span>
                  <span className="text-text-muted">·</span>
                  <span>uptime 4m 21s</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setSandboxRunning((v) => !v)}
                >
                  {sandboxRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Pause sandbox
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Resume sandbox
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-start gap-3">
                <BadgeCheck className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold mb-0.5">
                    Prices verified by 104 real people
                  </div>
                  <div className="text-text-muted">
                    Measured via Terac panels, not guessed.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
