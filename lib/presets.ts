/**
 * Model presets, taken from Nutlope/open-pictionary (lib/racers.ts).
 *
 * This table is the reason the preset picker exists. Every one of these models
 * is a vision model that can name a doodle, and every one of them has a
 * different switch for turning reasoning off. Get the switch wrong and nothing
 * errors: the model reasons for hundreds of tokens, runs out of budget, and
 * answers nothing. Those notes are below, verbatim in spirit from the runs that
 * produced them.
 *
 * All of them are on Together AI. Any other OpenAI-compatible endpoint works
 * too — pick "Custom" and type it in — but then you own the parameters.
 */
export type Preset = {
  key: string;
  label: string;
  lab: string;
  endpoint: string;
  model: string;
  /** Extra request fields: the thinking switch, and room for what reasoning slips through. */
  params: Record<string, unknown>;
};

const TOGETHER = "https://api.together.xyz/v1";

export const PRESETS: Preset[] = [
  {
    key: "kimi-k3",
    label: "Kimi K3",
    lab: "Moonshot",
    endpoint: TOGETHER,
    model: "moonshotai/Kimi-K3",
    // About a second most of the time, with a long tail.
    params: { reasoning: { enabled: false }, max_tokens: 48 },
  },
  {
    key: "qwen3-8-flash",
    label: "Qwen3.8 Flash",
    lab: "Qwen",
    endpoint: TOGETHER,
    model: "Qwen/Qwen3.8-Flash",
    // Qwen3.8 2.4T rejects images on serverless; the Flash one takes them.
    // It also refuses reasoning_effort alongside enable_thinking: false.
    params: { chat_template_kwargs: { enable_thinking: false }, max_tokens: 40 },
  },
  {
    key: "glm-5-3-flash",
    label: "GLM-5.3 Flash",
    lab: "Z.ai",
    endpoint: TOGETHER,
    model: "zai-org/GLM-5.3-Flash",
    // Usually answers with no reasoning at all, but now and then it thinks a
    // few dozen tokens first; a tight cap turns those into empty replies.
    params: { reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false }, max_tokens: 160 },
  },
  {
    key: "minimax-m3",
    label: "MiniMax M3",
    lab: "MiniMax",
    endpoint: TOGETHER,
    model: "MiniMaxAI/MiniMax-M3",
    // The only switch that fully stops its reasoning.
    params: { thinking: { type: "disabled" }, max_tokens: 24 },
  },
  {
    key: "deepseek-v4-1-flash",
    label: "DeepSeek V4.1 Flash",
    lab: "DeepSeek",
    endpoint: TOGETHER,
    model: "deepseek-ai/DeepSeek-V4.1-Flash",
    params: { thinking: { type: "disabled" }, max_tokens: 24 },
  },
  {
    key: "nemotron-3-5-super",
    label: "Nemotron 3.5 Super",
    lab: "NVIDIA",
    endpoint: TOGETHER,
    model: "nvidia/NVIDIA-Nemotron-3.5-Super-VL",
    // Sees sketches and answers in about half a second with this off.
    params: { chat_template_kwargs: { enable_thinking: false }, max_tokens: 24 },
  },
  {
    key: "muse-spark",
    label: "Muse Spark",
    lab: "Meta",
    endpoint: TOGETHER,
    model: "meta-models/Muse-Spark-Open-816B-A42B",
    // Any of reasoning.enabled, enable_thinking or thinking.type stops it;
    // reasoning_effort "none" makes it return nothing at all.
    params: { reasoning: { enabled: false }, max_tokens: 24 },
  },
];

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** True when the preset still matches what the form says. */
export function presetMatches(preset: Preset, endpoint: string, model: string): boolean {
  return preset.endpoint === endpoint.trim() && preset.model === model.trim();
}
