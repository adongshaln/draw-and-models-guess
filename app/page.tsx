"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMe, saveMe, saveSeat, type Me } from "@/lib/client";
import { PRESETS, presetByKey, presetMatches } from "@/lib/presets";
import { Wordmark } from "@/components/Brand";

const EMPTY: Me = { name: "", endpoint: "https://api.together.xyz/v1", model: "", apiKey: "", presetKey: "" };

const FIELD =
  "h-11 w-full rounded-[14px] bg-[var(--card-2)] px-3.5 text-[0.9375rem] font-medium text-ink outline-none ring-1 ring-line transition placeholder:text-ink-3 focus:ring-2 focus:ring-ink/25";

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

  function pick(key: string) {
    const preset = presetByKey(key);
    if (!preset) {
      set("presetKey", "");
      return;
    }
    setMe((current) => ({ ...current, presetKey: preset.key, endpoint: preset.endpoint, model: preset.model }));
  }

  /** The preset's request fields, but only while the form still says what it said. */
  function paramsFor(): Record<string, unknown> | undefined {
    const preset = presetByKey(me.presetKey ?? "");
    return preset && presetMatches(preset, me.endpoint, me.model) ? preset.params : undefined;
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
      const payload = { name: me.name.trim(), endpoint: me.endpoint.trim(), model: me.model.trim(), params: paramsFor() };
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { code?: string; playerId?: string; token?: string; error?: string };
      if (!res.ok || !data.code || !data.playerId || !data.token) throw new Error(data.error ?? "Could not open a room.");
      saveMe({ ...me, name: payload.name, endpoint: payload.endpoint, model: payload.model });
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
      const payload = {
        action: "join",
        name: me.name.trim(),
        endpoint: me.endpoint.trim(),
        model: me.model.trim(),
        params: paramsFor(),
      };
      const res = await fetch(`/api/room/${room}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { playerId?: string; token?: string; error?: string };
      if (!res.ok || !data.playerId || !data.token) throw new Error(data.error ?? "Could not join that room.");
      saveMe({ ...me, name: payload.name, endpoint: payload.endpoint, model: payload.model });
      saveSeat(room, { playerId: data.playerId, token: data.token });
      router.push(`/room/${room}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join that room.");
      setBusy(null);
    }
  }

  const preset = presetByKey(me.presetKey ?? "");
  const usingPreset = Boolean(preset && presetMatches(preset, me.endpoint, me.model));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10">
      <header className="flex items-center justify-between gap-3 px-1">
        <Wordmark />
        <span className="tx-small hidden text-ink-2 sm:block">bring your own model</span>
      </header>

      <section className="sticker p-5 sm:p-7">
        <p className="tx-label text-ink-3">your seat</p>
        <h1 className="tx-word mt-1">Draw &amp; models guess</h1>
        <p className="tx-body mt-2 max-w-md text-ink-2">
          One person draws, every model at the table gets three looks at it, then the pencil passes on.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="block">
            <span className="tx-label text-ink-3">model</span>
            <select className={`${FIELD} mt-1 appearance-none`} value={preset?.key ?? ""} onChange={(e) => pick(e.target.value)}>
              <option value="">Custom — I will type the endpoint myself</option>
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {p.lab}
                </option>
              ))}
            </select>
          </label>
          <p className="tx-small text-ink-3">
            {usingPreset
              ? "This preset also sends the fields that switch reasoning off — without them a thinking model burns its budget and answers nothing."
              : "A preset fills in the endpoint, the model id and the switch that stops it thinking out loud. Edit either field and the switch is dropped."}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="tx-label text-ink-3">your name</span>
              <input className={`${FIELD} mt-1`} value={me.name} maxLength={20} placeholder="ada" onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="block">
              <span className="tx-label text-ink-3">model id</span>
              <input
                className={`${FIELD} mt-1 font-mono text-[0.8125rem]`}
                value={me.model}
                maxLength={80}
                placeholder="moonshotai/Kimi-K3"
                onChange={(e) => set("model", e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="tx-label text-ink-3">base url</span>
            <input
              className={`${FIELD} mt-1 font-mono text-[0.8125rem]`}
              value={me.endpoint}
              maxLength={300}
              placeholder="https://api.together.xyz/v1"
              onChange={(e) => set("endpoint", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="tx-label text-ink-3">api key</span>
            <input
              className={`${FIELD} mt-1 font-mono text-[0.8125rem]`}
              type="password"
              value={me.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(e) => set("apiKey", e.target.value)}
            />
          </label>
          <p className="tx-small text-ink-3">
            The key stays in this browser. It rides along with each guess, gets used once and is never stored.
          </p>
        </div>

        {error ? <p className="tx-small mt-4 rounded-2xl bg-bad-soft px-3.5 py-2.5 text-bad">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button className="pill pill-ink h-11 px-5 text-[0.9375rem]" onClick={create} disabled={busy !== null}>
            {busy === "create" ? "opening…" : "start a room"}
          </button>
          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} h-11 w-32 text-center font-mono tracking-[0.22em] uppercase`}
              value={code}
              maxLength={8}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
            />
            <button className="pill h-11 px-4" onClick={join} disabled={busy !== null || !code.trim()}>
              {busy === "join" ? "joining…" : "join"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          ["1 · draw", "The room deals a word. Only the artist sees it."],
          ["2 · guess", "Every model gets three looks at the finished drawing."],
          ["3 · score", "3 points for the first look, 2 for the second, 1 for the third."],
        ].map(([title, body]) => (
          <div key={title} className="sticker p-4">
            <p className="tx-label text-ink-3">{title}</p>
            <p className="tx-small mt-1 text-ink-2">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
