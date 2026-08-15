import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setupSteps } from "@/data/mock";
import { cn } from "@/lib/cn";

export default function SetupFlow() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (current >= setupSteps.length) return;
    const t = setTimeout(
      () => setCurrent((c) => c + 1),
      setupSteps[current].durationMs
    );
    return () => clearTimeout(t);
  }, [current]);

  const done = current >= setupSteps.length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent" />
          <span className="font-bold tracking-tight">ROOM2STORE</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Agents at work</h1>
        <p className="text-text-secondary mb-10">
          Campaign <span className="font-mono text-xs">{campaignId}</span> is
          spinning up. Sit tight — this takes about 30 seconds.
        </p>

        <ol className="relative border-l border-border pl-8 space-y-6">
          {setupSteps.map((step, i) => {
            const state =
              i < current ? "done" : i === current ? "active" : "pending";
            return (
              <li key={step.key} className="relative">
                <span
                  className={cn(
                    "absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full border-2 bg-canvas",
                    state === "done" && "border-success",
                    state === "active" && "border-accent",
                    state === "pending" && "border-border"
                  )}
                >
                  {state === "done" && (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  )}
                  {state === "active" && (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  )}
                  {state === "pending" && (
                    <Circle className="w-3 h-3 text-text-muted" />
                  )}
                </span>
                <div
                  className={cn(
                    "rounded-card border p-4 transition-colors",
                    state === "active"
                      ? "border-accent bg-accent-soft/20"
                      : "border-border bg-surface1",
                    state === "pending" && "opacity-50"
                  )}
                >
                  <div className="font-semibold text-sm">{step.title}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {step.detail}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {done && (
          <div className="mt-10 text-center animate-fadeSlide">
            <div className="mb-4 text-lg font-semibold">
              Your storefront is live.
            </div>
            <Button
              size="lg"
              onClick={() => navigate(`/dashboard/${campaignId}`)}
            >
              Open dashboard
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
