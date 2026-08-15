import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Video, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { campaign } from "@/data/mock";

export default function SellerUpload() {
  const navigate = useNavigate();
  const [exclude, setExclude] = useState("my laptop, the framed photo");
  const [file, setFile] = useState<string | null>(null);

  function submit() {
    navigate(`/dashboard/${campaign.id}/setup`);
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent" />
            <span className="font-bold tracking-tight">ROOM2STORE</span>
          </div>
          <Badge variant="accent">
            <Sparkles className="w-3 h-3" /> agent-run
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Point your phone at a room.
          </h1>
          <p className="text-text-secondary text-lg">
            Agents catalog every object, price it on real humans, and sell it
            for you. You keep the money.
          </p>
        </div>

        <Card>
          <CardContent className="p-8 space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">
                1. Room video
              </label>
              <label
                htmlFor="file"
                className="flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed border-border bg-surface1 hover:bg-surface2 cursor-pointer transition-colors"
              >
                {file ? (
                  <>
                    <Video className="w-8 h-8 text-accent mb-2" />
                    <span className="text-sm font-medium">{file}</span>
                    <span className="text-xs text-text-muted mt-1">
                      Click to replace
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-text-muted mb-2" />
                    <span className="text-sm font-medium">
                      Drop a 30-second room video
                    </span>
                    <span className="text-xs text-text-muted mt-1">
                      MP4, MOV up to 200MB
                    </span>
                  </>
                )}
                <input
                  id="file"
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) =>
                    setFile(e.target.files?.[0]?.name ?? "room-walkthrough.mp4")
                  }
                />
              </label>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                2. Sell everything except…
              </label>
              <Input
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
                placeholder="my laptop, the framed photos, my cat"
              />
              <p className="text-xs text-text-muted mt-2">
                Comma-separated list. Agents will skip anything that matches.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-surface2 border border-border p-3 text-xs text-text-secondary">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
              Prices are measured on real humans via Terac, not guessed by an
              LLM. Compliance vetoes prohibited items before deploy.
            </div>

            <Button size="lg" className="w-full" onClick={submit}>
              Launch campaign
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
