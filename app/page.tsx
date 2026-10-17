"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMe, saveMe, saveSeat, type Me } from "@/lib/client";

const EMPTY: Me = { name: "", endpoint: "https://api.together.xyz/v1", model: "", apiKey: "" };

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(EMPTY);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadMe();
    if (saved) setMe(saved);
    // A shared invite link lands here as /?room=ABCDE.
    const invited = new URLSearchParams(window.location.search).get("room");
    if (invited) setCode(invited.toUpperCase().slice(0, 8));
  }, []);

  function set(key: keyof Me, value: string) {
    setMe((current) => {
      const next = { ...current };
      next[key] = value;
      return next;
    });
  }

  function valid(): string | null {
    if (!me.name.trim()) return "Pick a name.";
    if (!me.endpoint.trim().startsWith("https://")) return "The endpoint has to start with https://";
    if (!me.model.trim()) return "Name the model you want to play with.";
    if (!me.apiKey.trim()) return "Your API key is missing.";
    return null;
  }

  async function create() {
    const problem = valid();
    if (problem) return setError(problem);
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: me.name.trim(), endpoint: me.endpoint.trim(), model: me.model.trim() }),
      });
      const data = (await res.json()) as { code?: string; playerId?: string; token?: string; error?: string };
      if (!res.ok || !data.code || !data.playerId || !data.token) throw new Error(data.error ?? "Could not open a room.");
      saveMe({ ...me, name: me.name.trim(), endpoint: me.endpoint.trim(), model: me.model.trim() });
      saveSeat(data.code, { playerId: data.playerId, token: data.token });
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open a room.");
      setBusy(null);
    }
  }

  async function join() {
    const problem = valid();
    if (problem) return setError(problem);
    const room = code.trim().toUpperCase();
    if (room.length < 4) return setError("That room code looks too short.");
    setBusy("join");
    setError(null);
    try {
      const res = await fetch(`/api/room/${room}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", name: me.name.trim(), endpoint: me.endpoint.trim(), model: me.model.trim() }),
      });
      const data = (await res.json()) as { playerId?: string; token?: string; error?: string };
      if (!res.ok || !data.playerId || !data.token) throw new Error(data.error ?? "Could not join that room.");
      saveMe({ ...me, name: me.name.trim(), endpoint: me.endpoint.trim(), model: me.model.trim() });
      saveSeat(room, { playerId: data.playerId, token: data.token });
      router.push(`/room/${room}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join that room.");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-5 py-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">a party game for models</p>
        <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">Draw &amp; Models Guess</h1>
        <p className="mt-3 max-w-lg text-[15px] leading-6 text-mute">
          Everyone brings their own model. One person draws, every model gets three looks at it, then the pencil passes to the next person.
        </p>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-mute">Your seat</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">Your name</span>
            <input className="field" value={me.name} maxLength={20} placeholder="ada" onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">Model name</span>
            <input className="field" value={me.model} maxLength={80} placeholder="moonshotai/Kimi-K3" onChange={(e) => set("model", e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-mute">Base URL (OpenAI-compatible)</span>
            <input
              className="field font-mono text-[13px]"
              value={me.endpoint}
              maxLength={300}
              placeholder="https://api.together.xyz/v1"
              onChange={(e) => set("endpoint", e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-mute">API key</span>
            <input
              className="field font-mono text-[13px]"
              type="password"
              value={me.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(e) => set("apiKey", e.target.value)}
            />
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-mute">
          The key stays in this browser. It is sent with each guess to this site&apos;s server, which forwards it once to the URL above and never stores it.
        </p>

        {error ? <p className="mt-4 rounded-lg bg-[#ffe4e0] px-3 py-2 text-sm text-[#a01f14]">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <button className="btn btn-primary flex-1" onClick={create} disabled={busy !== null}>
            {busy === "create" ? "Opening…" : "Start a room"}
          </button>
          <div className="flex flex-1 items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-mute">Room code</span>
              <input
                className="field font-mono uppercase tracking-[0.2em]"
                value={code}
                maxLength={8}
                placeholder="ABCDE"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void join();
                }}
              />
            </label>
            <button className="btn btn-ghost" onClick={join} disabled={busy !== null || !code.trim()}>
              {busy === "join" ? "Joining…" : "Join"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["1 · Draw", "The room deals a word. Only the artist sees it."],
          ["2 · Guess", "Every model gets three looks at the finished drawing."],
          ["3 · Score", "3 points for the first look, 2 for the second, 1 for the third."],
        ].map(([title, body]) => (
          <div key={title} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">{title}</p>
            <p className="mt-1 leading-6">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
