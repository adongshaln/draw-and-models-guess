"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, type CanvasHandle } from "@/components/Canvas";
import { colorFor, initials, loadMe, loadSeat, saveSeat, type Me, type Seat } from "@/lib/client";
import type { PublicRoom } from "@/lib/room";

const POLL_MS = 1200;
const MAX_ATTEMPTS = 3;

function secondsLeft(deadline: number | null, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function RoomView({ code }: { code: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [laneError, setLaneError] = useState<string | null>(null);

  const handle = useRef<CanvasHandle | null>(null);
  const roomRef = useRef<PublicRoom | null>(null);
  const meRef = useRef<Me | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const driving = useRef(-1);
  const running = useRef(false);
  const lastInk = useRef<string | null>(null);

  meRef.current = me;
  seatRef.current = seat;

  /* ---------------- join and resume ---------------- */

  useEffect(() => {
    const config = loadMe();
    if (!config) {
      router.replace("/");
      return;
    }
    setMe(config);
    const saved = loadSeat(code);
    if (saved) {
      setSeat(saved);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/room/${code}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", name: config.name, endpoint: config.endpoint, model: config.model }),
        });
        const data = (await res.json()) as { playerId?: string; token?: string; error?: string };
        if (!res.ok || !data.playerId || !data.token) throw new Error(data.error ?? "Could not join that room.");
        const next = { playerId: data.playerId, token: data.token };
        saveSeat(code, next);
        if (alive) setSeat(next);
      } catch (e) {
        if (alive) setFatal(e instanceof Error ? e.message : "Could not join that room.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, router]);

  /* ---------------- polling ---------------- */

  const poll = useCallback(async (): Promise<PublicRoom | null> => {
    const current = seatRef.current;
    if (!current) return null;
    try {
      const res = await fetch(`/api/room/${code}?p=${encodeURIComponent(current.token)}`, { cache: "no-store" });
      const data = (await res.json()) as PublicRoom & { error?: string };
      if (!res.ok) {
        setFatal(data.error ?? "Lost the room.");
        return null;
      }
      roomRef.current = data;
      setRoom(data);
      return data;
    } catch {
      return null;
    }
  }, [code]);

  useEffect(() => {
    if (!seat) return;
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [seat, poll]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  /* ---------------- actions ---------------- */

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}): Promise<PublicRoom | null> => {
      const current = seatRef.current;
      if (!current) return null;
      setBusy(true);
      try {
        const res = await fetch(`/api/room/${code}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, token: current.token, ...extra }),
        });
        const data = (await res.json()) as PublicRoom & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "That did not work.");
          return null;
        }
        roomRef.current = data;
        setRoom(data);
        setError(null);
        return data;
      } catch {
        setError("The server did not answer.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  /* ---------------- this browser runs its own model ---------------- */

  const runModel = useCallback(
    async (round: number) => {
      if (running.current) return;
      const config = meRef.current;
      const current = seatRef.current;
      if (!config || !current) return;
      running.current = true;
      setThinking(true);
      setLaneError(null);
      try {
        for (;;) {
          const latest = roomRef.current;
          if (!latest || latest.phase !== "guessing" || latest.round !== round) break;
          const mine = latest.guesses.filter((g) => g.playerId === latest.you);
          if (mine.length >= MAX_ATTEMPTS) break;
          if (mine.some((g) => g.verdict === "correct")) break;

          const res = await fetch(`/api/room/${code}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: current.token, apiKey: config.apiKey }),
          });
          const data = (await res.json()) as { error?: string; verdict?: string };
          if (!res.ok) {
            setLaneError(data.error ?? "Your model could not answer.");
            break;
          }
          await poll();
          if (data.verdict === "correct") break;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      } catch {
        setLaneError("Your model call failed.");
      } finally {
        running.current = false;
        setThinking(false);
      }
    },
    [code, poll],
  );

  useEffect(() => {
    if (!room || !me || !seat) return;
    if (room.phase !== "guessing") return;
    if (driving.current === room.round) return;
    driving.current = room.round;
    void runModel(room.round);
  }, [room, me, seat, runModel]);

  /* ---------------- live preview while drawing ---------------- */

  const drawingNow = room?.phase === "drawing";
  const iAmDrawing = Boolean(room && drawingNow && room.you === room.drawerId);
  const roundNow = room?.round ?? 0;

  useEffect(() => {
    if (!iAmDrawing) return;
    lastInk.current = null;
    const id = setInterval(() => {
      const image = handle.current?.snapshot(384);
      if (!image || image === lastInk.current) return;
      lastInk.current = image;
      const current = seatRef.current;
      if (!current) return;
      void fetch(`/api/room/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ink", token: current.token, image }),
      }).catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [iAmDrawing, code, roundNow]);

  /* ---------------- render ---------------- */

  if (fatal) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 text-center">
        <h1 className="text-2xl font-bold">{fatal}</h1>
        <p className="text-mute">The room may have expired, or the code is wrong.</p>
        <button className="btn btn-primary mx-auto" onClick={() => router.push("/")}>
          Back to the lobby
        </button>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="thinking text-sm text-mute">Connecting to room {code}…</p>
      </main>
    );
  }

  const drawer = room.players.find((p) => p.id === room.drawerId);
  const isDrawer = room.you === room.drawerId;
  const isHost = room.players[0]?.id === room.you;
  const left = secondsLeft(room.deadline, now);
  const mine = room.guesses.filter((g) => g.playerId === room.you);
  const solvers = room.players.filter((p) => room.guesses.some((g) => g.playerId === p.id && g.verdict === "correct"));
  const ranked = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="text-sm text-mute hover:text-ink" onClick={() => router.push("/")}>
            ←
          </button>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">room</p>
            <p className="font-mono text-2xl font-bold leading-none tracking-[0.15em]">{room.code}</p>
          </div>
          <button
            className="btn btn-ghost !py-1.5 !text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/?room=${room.code}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy invite link"}
          </button>
        </div>
        <ul className="flex flex-wrap items-center gap-2">
          {ranked.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-line bg-card px-2.5 py-1 text-xs"
              title={`${p.name} · ${p.model}`}
            >
              <span
                className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: colorFor(room.players, p.id) }}
              >
                {initials(p.name)}
              </span>
              <span className="font-semibold">{p.name}</span>
              <span className="font-mono text-mute">{p.score}</span>
              {p.id === room.you ? <span className="text-[10px] uppercase text-mute">you</span> : null}
            </li>
          ))}
        </ul>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-mute">
                {room.phase === "lobby" ? "lobby" : `round ${room.round} of ${room.totalRounds}`}
              </p>
              <h2 className="text-xl font-bold leading-tight">
                {room.phase === "lobby" && "Everyone in?"}
                {room.phase === "drawing" && (isDrawer ? "Draw this" : `${drawer?.name ?? "Someone"} is drawing`)}
                {room.phase === "guessing" && "The models are looking"}
                {room.phase === "reveal" && "Round over"}
                {room.phase === "over" && "Final board"}
              </h2>
            </div>
            {left !== null && (room.phase === "drawing" || room.phase === "guessing") ? (
              <span className="rounded-full border border-line px-3 py-1 font-mono text-sm tabular-nums">{left}s</span>
            ) : null}
          </div>

          {room.phase === "lobby" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line bg-white/60 p-8 text-center">
              <p className="max-w-sm text-sm leading-6 text-mute">
                {room.players.length < 2
                  ? "You are the only one here. Invite someone with the room code — or start alone and play your model against the clock."
                  : `${room.players.length} players. The first artist is ${room.players[0].name}.`}
              </p>
              {isHost ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => void act("start")}>
                  {busy ? "Dealing…" : "Start the game"}
                </button>
              ) : (
                <p className="thinking text-sm text-mute">Waiting for {room.players[0]?.name} to start…</p>
              )}
            </div>
          ) : null}

          {room.phase === "drawing" ? (
            isDrawer ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-mute">Your word:</span>
                  <strong className="rounded-lg bg-[#ffe08a] px-2.5 py-1 text-lg font-black tracking-tight">{room.word}</strong>
                  <span className="text-xs text-mute">Nobody else can see this.</span>
                </div>
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line">
                  <Canvas handleRef={handle} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary" disabled={busy} onClick={() => void act("done", { image: handle.current?.snapshot(512) ?? null })}>
                    Done — let them guess
                  </button>
                  <button className="btn btn-ghost" onClick={() => handle.current?.undo()}>
                    Undo
                  </button>
                  <button className="btn btn-ghost" onClick={() => handle.current?.clear()}>
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-white">
                {room.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={room.image} alt="The drawing so far" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <p className="text-sm font-semibold">Nothing on the page yet</p>
                    <p className="text-xs text-mute">The drawing appears here as {drawer?.name ?? "they"} work.</p>
                  </div>
                )}
              </div>
            )
          ) : null}

          {room.phase === "guessing" || room.phase === "reveal" ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-white">
              {room.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.image} alt="The finished drawing" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-mute">The artist ran out of time.</div>
              )}
            </div>
          ) : null}

          {room.phase === "reveal" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#fffbe9] px-4 py-3">
              <p className="text-sm">
                The word was <strong className="text-lg font-black">{room.word}</strong>
                {solvers.length === 0 ? " — nobody got it." : ` — ${solvers.map((s) => s.name).join(", ")} got it.`}
              </p>
              <button className="btn btn-primary" disabled={busy} onClick={() => void act("next", { round: room.round })}>
                {room.round >= room.totalRounds ? "See the final board" : "Next artist →"}
              </button>
            </div>
          ) : null}

          {room.phase === "over" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-line bg-[#fffbe9] p-6">
              <h3 className="text-lg font-black">Final board</h3>
              <ol className="w-full max-w-sm space-y-1.5">
                {ranked.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
                    <span className="w-4 font-mono text-xs text-mute">{i + 1}</span>
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: colorFor(room.players, p.id) }}
                    >
                      {initials(p.name)}
                    </span>
                    <span className="flex-1 text-sm font-semibold">{p.name}</span>
                    <span className="font-mono text-sm">{p.score}</span>
                  </li>
                ))}
              </ol>
              <button className="btn btn-primary" onClick={() => router.push("/")}>
                Start another room
              </button>
            </div>
          ) : null}
        </section>

        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-mute">The field</h2>
            {thinking ? <span className="thinking text-[11px] font-semibold text-accent">your model is looking…</span> : null}
          </div>

          {laneError ? <p className="rounded-lg bg-[#ffe4e0] px-3 py-2 text-xs text-[#a01f14]">{laneError}</p> : null}

          <ul className="flex flex-col gap-2">
            {room.players.map((p) => {
              const theirs = room.guesses.filter((g) => g.playerId === p.id);
              const solved = theirs.find((g) => g.verdict === "correct");
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border p-2.5 ${solved ? "border-[#0f9d58]/40 bg-[#f0fbf3]" : "border-line bg-white/70"}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: colorFor(room.players, p.id) }}
                    >
                      {initials(p.name)}
                    </span>
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {p.isDrawer && room.phase !== "over" ? (
                      <span className="rounded bg-[#ffe08a] px-1.5 py-0.5 text-[10px] font-bold uppercase">artist</span>
                    ) : null}
                    <span className="ml-auto font-mono text-xs text-mute">{p.score}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-mute">{p.model}</p>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    {[1, 2, 3].map((n) => {
                      const g = theirs.find((x) => x.attempt === n);
                      return (
                        <span
                          key={n}
                          className="dot"
                          style={{
                            backgroundColor:
                              g?.verdict === "correct"
                                ? "#0f9d58"
                                : g?.verdict === "close"
                                  ? "#e08a00"
                                  : g
                                    ? "#c9c1b3"
                                    : undefined,
                          }}
                        />
                      );
                    })}
                    <span className="ml-1 text-[10px] text-mute">
                      {theirs.length === 0 ? "waiting" : `${theirs.length}/3 looks`}
                    </span>
                  </div>

                  {theirs.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {theirs.map((g) => (
                        <li
                          key={g.id}
                          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                            g.verdict === "correct"
                              ? "bg-[#d8f5e2] text-[#0b6b3d]"
                              : g.verdict === "close"
                                ? "bg-[#fff0d1] text-[#8a5300]"
                                : "bg-[#f0ece2] text-[#5b554c] line-through"
                          }`}
                        >
                          {g.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {room.phase === "guessing" ? (
            <p className="text-[11px] leading-5 text-mute">
              {mine.length === 0 && !isDrawer
                ? "Your model is on its first look."
                : `Your model has used ${mine.length} of 3 looks.`}{" "}
              3 points for a first-look hit, 2 for the second, 1 for the third.
            </p>
          ) : null}

          {room.history.length > 0 ? (
            <div className="mt-1 border-t border-line pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Earlier</p>
              <ul className="mt-1 space-y-1">
                {[...room.history].reverse().map((h) => {
                  const who = room.players.find((p) => p.id === h.drawerId)?.name ?? "someone";
                  return (
                    <li key={h.round} className="text-[11px] leading-5 text-mute">
                      <span className="font-semibold text-ink">{h.word}</span> · drawn by {who} ·{" "}
                      {h.solvers.length === 0 ? "nobody solved it" : `${h.solvers.length} solved`}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <p className="sr-only" role="status">
        {room.phase} round {room.round} of {room.totalRounds}
      </p>

      {error ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-[#a01f14] px-4 py-2 text-sm text-white shadow-lg">{error}</div>
      ) : null}
    </main>
  );
}
