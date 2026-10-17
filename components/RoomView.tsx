"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, type CanvasHandle } from "@/components/Canvas";
import { Creature, type Mood } from "@/components/Creature";
import { Burst } from "@/components/Burst";
import { Clock } from "@/components/Clock";
import { Word } from "@/components/Word";
import { Wordmark } from "@/components/Brand";
import { onSoundChange, setSoundOn, sound, soundOn } from "@/components/sound";
import { loadMe, loadSeat, saveSeat, type Me, type Seat } from "@/lib/client";
import { DRAW_SECONDS, GUESS_SECONDS, type PublicRoom } from "@/lib/room";
import { roomColor, seatOf } from "@/lib/seats";

const POLL_MS = 1200;
const MAX_ATTEMPTS = 3;

/** 给屏幕阅读器用的阶段名。 */
const PHASE_CN: Record<string, string> = {
  lobby: "大厅",
  drawing: "作画中",
  guessing: "猜词中",
  reveal: "揭晓",
  over: "结束",
};

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <path d="M22 9l-6 6M16 9l6 6" />
      )}
    </svg>
  );
}

export function RoomView({ code }: { code: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [laneError, setLaneError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handle = useRef<CanvasHandle | null>(null);
  const roomRef = useRef<PublicRoom | null>(null);
  const meRef = useRef<Me | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const driving = useRef(-1);
  const running = useRef(false);
  const lastInk = useRef<string | null>(null);
  const sounded = useRef(0);

  meRef.current = me;
  seatRef.current = seat;

  /* ---------------- 加入与恢复席位 ---------------- */

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
        if (!res.ok || !data.playerId || !data.token) throw new Error(data.error ?? "加入失败。");
        const next = { playerId: data.playerId, token: data.token };
        saveSeat(code, next);
        if (alive) setSeat(next);
      } catch (e) {
        if (alive) setFatal(e instanceof Error ? e.message : "加入失败。");
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, router]);

  /* ---------------- 轮询 ---------------- */

  const poll = useCallback(async (): Promise<PublicRoom | null> => {
    const current = seatRef.current;
    if (!current) return null;
    try {
      const res = await fetch(`/api/room/${code}?p=${encodeURIComponent(current.token)}`, { cache: "no-store" });
      const data = (await res.json()) as PublicRoom & { error?: string };
      if (!res.ok) {
        setFatal(data.error ?? "与房间断开了。");
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

  /* ---------------- 声音 ---------------- */

  useEffect(() => {
    setSoundEnabled(soundOn());
    return onSoundChange(() => setSoundEnabled(soundOn()));
  }, []);

  /* ---------------- 房间配色 ---------------- */

  useEffect(() => {
    if (!room) return;
    const color = roomColor(room.code, room.phase === "lobby" ? 0 : room.round);
    document.body.style.setProperty("--room", color);
  }, [room]);

  /* ---------------- 操作 ---------------- */

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
          setError(data.error ?? "没成功。");
          return null;
        }
        roomRef.current = data;
        setRoom(data);
        setError(null);
        return data;
      } catch {
        setError("服务器没有响应。");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  /* ---------------- 这个浏览器跑自己的模型 ---------------- */

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
            setLaneError(data.error ?? "你的模型没有回答。");
            break;
          }
          await poll();
          if (data.verdict === "correct") {
            sound.solve();
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      } catch {
        setLaneError("模型调用失败。");
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

  /* ---------------- 作画时的实时预览 ---------------- */

  const iAmDrawing = Boolean(room && room.phase === "drawing" && room.you === room.drawerId);
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

  /* ---------------- 揭晓时响一次 ---------------- */

  useEffect(() => {
    if (!room || room.phase !== "reveal") return;
    if (sounded.current === room.round) return;
    sounded.current = room.round;
    const last = room.history[room.history.length - 1];
    const winner = last?.solvers[0];
    if (winner) {
      const index = room.players.findIndex((p) => p.id === winner.playerId);
      sound.win(index < 0 ? 0 : index);
      sound.sparkle();
    } else {
      sound.close();
    }
  }, [room]);

  /* ---------------- 渲染 ---------------- */

  if (fatal) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="tx-display">{fatal}</h1>
        <p className="tx-body text-ink-2">房间可能过期了，或者房间码不对。</p>
        <button className="pill pill-ink h-11 px-5" onClick={() => router.push("/")}>
          回大厅
        </button>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="tx-body thinking text-ink-2">正在连接房间 {code}…</p>
      </main>
    );
  }

  const drawer = room.players.find((p) => p.id === room.drawerId);
  const isDrawer = room.you === room.drawerId;
  const isHost = room.players[0]?.id === room.you;
  const revealed = room.phase === "reveal" || room.phase === "over";
  const mine = room.guesses.filter((g) => g.playerId === room.you);
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const last = room.history[room.history.length - 1];
  const winnerSeat = last?.solvers[0] ? seatOf(room.players, last.solvers[0].playerId) : null;
  const total = room.phase === "drawing" ? DRAW_SECONDS : GUESS_SECONDS;
  const canSeeWord = Boolean(room.word) && (isDrawer || revealed);

  const headline =
    room.phase === "drawing"
      ? `${drawer?.name ?? "someone"} is drawing`
      : room.phase === "guessing"
        ? "the models are looking"
        : room.phase === "reveal"
          ? "round over"
          : "final board";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Wordmark />
        <div className="dock">
          <span className="dock-item tx-num font-bold tracking-[0.2em]" title="房间码">
            {room.code}
          </span>
          <button
            className="dock-item"
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
            {copied ? "已复制" : "邀请"}
          </button>
          <button
            className="dock-item dock-item-icon"
            aria-label={soundEnabled ? "静音" : "取消静音"}
            onClick={() => setSoundOn(!soundEnabled)}
          >
            <SoundIcon on={soundEnabled} />
          </button>
        </div>
      </header>

      {room.phase === "lobby" ? (
        <section className="sticker mx-auto mt-4 w-full max-w-xl p-6 text-center">
          <p className="tx-label text-ink-3">大厅</p>
          <h1 className="tx-display mt-1">
            {room.players.length < 2 ? "现在只有你一个人" : `桌上有 ${room.players.length} 个人`}
          </h1>
          <p className="tx-body mx-auto mt-2 max-w-sm text-ink-2">
            {room.players.length < 2
              ? "把房间码发给朋友。或者一个人先开，看你的模型要几秒才猜中。"
              : `第一个画手是 ${room.players[0]?.name}。`}
          </p>

          <ul className="mx-auto mt-5 flex w-full max-w-sm flex-col gap-2 text-left">
            {room.players.map((p, i) => {
              const s = seatOf(room.players, p.id);
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-[var(--card-2)] p-2">
                  <Creature color={s.color} shape={s.shape} size={34} />
                  <span className="tx-name truncate">{p.name}</span>
                  <span className="tx-small ml-auto truncate font-mono text-ink-3">{p.model}</span>
                  {i === 0 ? <span className="tx-small shrink-0 rounded-full bg-ink px-1.5 py-[1px] text-[10px] font-bold text-white">房主</span> : null}
                </li>
              );
            })}
          </ul>

          {isHost ? (
            <button className="pill pill-ink mt-5 h-11 px-5" disabled={busy} onClick={() => void act("start")}>
              {busy ? "发牌中…" : "开始游戏"}
            </button>
          ) : (
            <p className="tx-small thinking mt-5 text-ink-2">等 {room.players[0]?.name} 开始…</p>
          )}
        </section>
      ) : (
        <div className="grid flex-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex flex-col items-center gap-3">
            <div className="flex w-full flex-wrap items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="tx-label text-ink-3">{room.phase === "over" ? "全场结束" : `第 ${room.round} / ${room.totalRounds} 轮`}</p>
                {canSeeWord && room.word ? (
                  <Word word={room.word} />
                ) : (
                  <h1 className="tx-display truncate text-ink-2">{headline}</h1>
                )}
              </div>
              {room.phase === "drawing" || room.phase === "guessing" ? <Clock deadline={room.deadline} total={total} /> : null}
            </div>

            <div className="paper-col">
              <div className="paper relative aspect-square w-full overflow-hidden rounded-[26px] bg-white">
                {room.phase === "drawing" && isDrawer ? (
                  <Canvas handleRef={handle} />
                ) : room.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={room.image} alt="这幅画" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
                    <p className="tx-body font-semibold">{room.phase === "drawing" ? "纸上还是空的" : "画手超时了"}</p>
                    <p className="tx-small text-ink-3">
                      {room.phase === "drawing" ? `${drawer?.name ?? "对方"}画的东西会出现在这里` : "没有可看的画"}
                    </p>
                  </div>
                )}
                {revealed && winnerSeat ? <Burst key={room.round} seed={room.round} color={winnerSeat.color} /> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {room.phase === "drawing" && isDrawer ? (
                <>
                  <button
                    className="pill pill-ink h-11 px-5"
                    disabled={busy}
                    onClick={() => {
                      if ((handle.current?.ink() ?? 0) < 20) {
                        setError("先在纸上画点东西。");
                        return;
                      }
                      void act("done", { image: handle.current?.snapshot(512) ?? null });
                    }}
                  >
                    画完了，让他们猜
                  </button>
                  <button className="pill h-11 px-4" onClick={() => handle.current?.undo()}>
                    撤销
                  </button>
                  <button className="pill pill-ghost h-11 px-4" onClick={() => handle.current?.clear()}>
                    清空
                  </button>
                </>
              ) : null}

              {room.phase === "reveal" ? (
                <>
                  <p className="tx-body w-full text-center text-ink-2 sm:w-auto">
                    {last?.solvers.length ? `${last.solvers.length} 个模型猜中了` : "没有模型猜中 · 画手 -1"}
                  </p>
                  <button className="pill pill-ink h-11 px-5" disabled={busy} onClick={() => void act("next", { round: room.round })}>
                    {room.round >= room.totalRounds ? "看最终排名" : "下一位 →"}
                  </button>
                </>
              ) : null}

              {room.phase === "over" ? (
                <button className="pill pill-ink h-11 px-5" onClick={() => router.push("/")}>
                  再开一局
                </button>
              ) : null}
            </div>

            {room.phase === "guessing" && !isDrawer ? (
              <p className="tx-small max-w-sm text-center text-ink-2">
                揭晓之前看不到词 · 你的模型已经用了 {mine.length} / 3 次
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <p className="tx-label text-ink-3">赛场</p>
              {thinking ? <span className="tx-small thinking text-ink-2">你的模型正在看…</span> : null}
            </div>

            {laneError ? <p className="tx-small rounded-2xl bg-bad-soft px-3 py-2 text-bad">{laneError}</p> : null}

            <ul className="flex flex-col gap-2">
              {room.players.map((p) => {
                const s = seatOf(room.players, p.id);
                const theirs = room.guesses.filter((g) => g.playerId === p.id);
                const solved = theirs.find((g) => g.verdict === "correct");
                const mood: Mood = solved ? "happy" : p.id === room.you && thinking ? "thinking" : "idle";
                return (
                  <li key={p.id} className={`sticker lane-card flex items-start gap-2.5 p-2.5 ${solved ? "ring-2 ring-ink/10" : ""}`}>
                    <Creature color={s.color} shape={s.shape} size={40} mood={mood} crown={Boolean(solved)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="tx-name truncate">{p.name}</span>
                        {p.isDrawer && room.phase !== "over" ? (
                          <span className="tx-small shrink-0 rounded-full bg-ink px-1.5 py-[1px] text-[10px] font-bold text-white">画手</span>
                        ) : null}
                        <span className="tx-num tx-small ml-auto shrink-0 text-ink-2">{p.score}</span>
                      </div>
                      <p className="tx-small truncate font-mono text-ink-3">{p.model}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {theirs.length === 0 ? (
                          p.id === room.you && thinking ? (
                            <span className="flex items-center gap-1">
                              {[0, 1, 2].map((d) => (
                                <span key={d} className="think-dot size-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${d * 0.14}s` }} />
                              ))}
                            </span>
                          ) : (
                            <span className="tx-small text-ink-3">等待中</span>
                          )
                        ) : (
                          theirs.map((g) => (
                            <span
                              key={g.id}
                              className={`tx-small rounded-lg px-1.5 py-0.5 ${
                                g.verdict === "correct"
                                  ? "bg-[#d8f5e2] text-[#0b6b3d]"
                                  : g.verdict === "close"
                                    ? "bg-close-soft text-close"
                                    : "marker-strike bg-[var(--card-2)] text-ink-2"
                              }`}
                              style={g.verdict === "wrong" ? ({ "--c": s.color } as React.CSSProperties) : undefined}
                            >
                              {g.text}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {room.history.length > 0 ? (
              <div className="mt-1 px-1">
                <p className="tx-label text-ink-3">之前</p>
                <ul className="mt-1 space-y-0.5">
                  {[...room.history].reverse().map((h) => {
                    const who = room.players.find((p) => p.id === h.drawerId)?.name ?? "有人";
                    return (
                      <li key={h.round} className="tx-small text-ink-3">
                        <span className="font-semibold text-ink">{h.word}</span> · {who} 画 ·{" "}
                        {h.solvers.length === 0 ? "没人猜中" : `${h.solvers.length} 个猜中`}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {room.phase === "over" ? (
              <div className="sticker mt-1 p-3">
                <p className="tx-label text-ink-3">最终排名</p>
                <ol className="mt-1.5 space-y-1">
                  {ranked.map((p, i) => {
                    const s = seatOf(room.players, p.id);
                    return (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="tx-num tx-small w-3 text-ink-3">{i + 1}</span>
                        <Creature color={s.color} shape={s.shape} size={24} mood={i === 0 ? "happy" : "idle"} />
                        <span className="tx-small truncate font-semibold">{p.name}</span>
                        <span className="tx-num tx-small ml-auto">{p.score}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <p className="sr-only" role="status">
        {PHASE_CN[room.phase] ?? room.phase}，第 {room.round} / {room.totalRounds} 轮
      </p>

      {error ? (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-lg">
          {error}
        </div>
      ) : null}
    </main>
  );
}
