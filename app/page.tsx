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
    // 邀请链接长这样：/?room=ABCDE
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

  /** 预设的请求字段，但只在表单还和预设一致时才发。 */
  function paramsFor(): Record<string, unknown> | undefined {
    const preset = presetByKey(me.presetKey ?? "");
    return preset && presetMatches(preset, me.endpoint, me.model) ? preset.params : undefined;
  }

  function valid(): string | null {
    if (!me.name.trim()) return "先起个名字。";
    if (!me.endpoint.trim().startsWith("https://")) return "接口地址要以 https:// 开头。";
    if (!me.model.trim()) return "填一个你要用的模型。";
    if (!me.apiKey.trim()) return "API 密钥还没填。";
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
      if (!res.ok || !data.code || !data.playerId || !data.token) throw new Error(data.error ?? "开房失败。");
      saveMe({ ...me, name: payload.name, endpoint: payload.endpoint, model: payload.model });
      saveSeat(data.code, { playerId: data.playerId, token: data.token });
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "开房失败。");
      setBusy(null);
    }
  }

  async function join() {
    const problem = valid();
    if (problem) return setError(problem);
    const room = code.trim().toUpperCase();
    if (room.length < 4) return setError("房间码太短了。");
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
      if (!res.ok || !data.playerId || !data.token) throw new Error(data.error ?? "加入失败。");
      saveMe({ ...me, name: payload.name, endpoint: payload.endpoint, model: payload.model });
      saveSeat(room, { playerId: data.playerId, token: data.token });
      router.push(`/room/${room}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败。");
      setBusy(null);
    }
  }

  const preset = presetByKey(me.presetKey ?? "");
  const usingPreset = Boolean(preset && presetMatches(preset, me.endpoint, me.model));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10">
      <header className="flex items-center justify-between gap-3 px-1">
        <Wordmark />
        <span className="tx-small hidden text-ink-2 sm:block">自带模型</span>
      </header>

      <section className="sticker p-5 sm:p-7">
        <p className="tx-label text-ink-3">你画，模型猜</p>
        <h1 className="tx-word mt-1">Sketch Test</h1>
        <p className="tx-body mt-2 max-w-md text-ink-2">
          一个人画，桌上每个模型都有三次机会看这幅画，然后铅笔交给下一个人。
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="block">
            <span className="tx-label text-ink-3">模型</span>
            <select className={`${FIELD} mt-1`} value={preset?.key ?? ""} onChange={(e) => pick(e.target.value)}>
              <option value="">自定义 —— 我自己填接口地址</option>
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {p.lab}
                </option>
              ))}
            </select>
          </label>
          <p className="tx-small text-ink-3">
            {usingPreset
              ? "这个预设会顺手把「关掉思考」的请求字段一起发过去——不发的话，会思考的模型会把预算烧光，然后交白卷。"
              : "预设会填好接口地址、模型 ID，以及那个让它别出声思考的开关。你手动改了这两个字段，开关就不发了。"}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="tx-label text-ink-3">你的名字</span>
              <input className={`${FIELD} mt-1`} value={me.name} maxLength={20} placeholder="阿达" onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="block">
              <span className="tx-label text-ink-3">模型 ID</span>
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
            <span className="tx-label text-ink-3">接口地址</span>
            <input
              className={`${FIELD} mt-1 font-mono text-[0.8125rem]`}
              value={me.endpoint}
              maxLength={300}
              placeholder="https://api.together.xyz/v1"
              onChange={(e) => set("endpoint", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="tx-label text-ink-3">API 密钥</span>
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
            密钥只留在这个浏览器里。每次猜词随请求上来一次，转发给上面那个地址，用完就丢，服务端不保存。
          </p>

          <div className="rounded-2xl bg-[var(--card-2)] px-3.5 py-3">
            <p className="tx-label">不留存任何数据</p>
            <p className="tx-small mt-1 text-ink-2">
              密钥只存在你自己的浏览器里，每次猜词用一次，我们不保存、不记录、不写日志。
              房间数据（昵称、模型名、画、猜词记录）只活在这一局里，游戏结束后 5 分钟内自动销毁。
            </p>
          </div>
        </div>

        {error ? <p className="tx-small mt-4 rounded-2xl bg-bad-soft px-3.5 py-2.5 text-bad">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button className="pill pill-ink h-11 px-5 text-[0.9375rem]" onClick={create} disabled={busy !== null}>
            {busy === "create" ? "开房中…" : "开一局"}
          </button>
          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} h-11 w-32 text-center font-mono tracking-[0.22em] uppercase`}
              value={code}
              maxLength={8}
              placeholder="房间码"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
            />
            <button className="pill h-11 px-4" onClick={join} disabled={busy !== null || !code.trim()}>
              {busy === "join" ? "加入中…" : "加入"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          ["1 · 画", "房间发一个词，只有画手看得到。"],
          ["2 · 猜", "所有模型对画好的图各有三次机会。"],
          ["3 · 计分", "第 1 次猜中 3 分，第 2 次 2 分，第 3 次 1 分；每轮最快的模型 +1；全员没猜中，画手 -1。"],
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
