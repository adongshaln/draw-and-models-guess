/**
 * 模型预设。每个预设打包三件事：接口地址、模型 ID、以及**让这个模型少想/别想**
 * 的那组请求字段。
 *
 * 这最后一件是重点。会思考的模型不会报错，它只会闷头想，然后交回空字符串或者
 * 半截词（"电子钟"只剩"电子"）。每个厂商的开关还不一样，所以这里按厂商分开写，
 * 并且尽量用官方文档里"最低"的那一档。
 */
export type Preset = {
  key: string;
  label: string;
  lab: string;
  endpoint: string;
  model: string;
  /** 额外请求字段：关思考的开关，以及给思考留的预算。 */
  params: Record<string, unknown>;
};

const TOGETHER = "https://api.together.xyz/v1";
const DEEPSEEK = "https://api.deepseek.com";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";

/** 10k 是上限不是消耗：思考关掉的模型答完就停，关不掉的也够它想完再答。 */
const BUDGET = 10000;

export const PRESETS: Preset[] = [
  {
    key: "deepseek-official",
    label: "DeepSeek Flash（官方）",
    lab: "DeepSeek",
    endpoint: DEEPSEEK,
    model: "deepseek-flash",
    // 官方文档：思考模式默认开启、effort 默认 high。不传这两个字段，它每次
    // 都会先想一大段。deepseek-flash 本身支持图像。
    params: { thinking: { type: "disabled" }, reasoning_effort: "low", max_tokens: BUDGET },
  },
  {
    key: "gemini-official",
    label: "Gemini（官方兼容端点）",
    lab: "Google",
    endpoint: GOOGLE,
    model: "gemini-2.5-flash",
    // Gemini 默认会思考，OpenAI 兼容层认 reasoning_effort。模型 ID 记得改成
    // 你自己账号里有的那个。
    params: { reasoning_effort: "low", max_tokens: BUDGET },
  },
  {
    key: "kimi-k3",
    label: "Kimi K3",
    lab: "Moonshot",
    endpoint: TOGETHER,
    model: "moonshotai/Kimi-K3",
    // 大约一秒，但有长尾。
    params: { reasoning: { enabled: false }, max_tokens: BUDGET },
  },
  {
    key: "qwen3-8-flash",
    label: "Qwen3.8 Flash",
    lab: "Qwen",
    endpoint: TOGETHER,
    model: "Qwen/Qwen3.8-Flash",
    // Qwen3.8 2.4T 在 serverless 上拒图，Flash 这个收图。
    // 它也不接受 reasoning_effort 和 enable_thinking: false 同时出现。
    params: { chat_template_kwargs: { enable_thinking: false }, max_tokens: BUDGET },
  },
  {
    key: "glm-5-3-flash",
    label: "GLM-5.3 Flash",
    lab: "Z.ai",
    endpoint: TOGETHER,
    model: "zai-org/GLM-5.3-Flash",
    params: { reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false }, max_tokens: BUDGET },
  },
  {
    key: "minimax-m3",
    label: "MiniMax M3",
    lab: "MiniMax",
    endpoint: TOGETHER,
    model: "MiniMaxAI/MiniMax-M3",
    // 只有这个开关能完全停住它的思考。
    params: { thinking: { type: "disabled" }, max_tokens: BUDGET },
  },
  {
    key: "deepseek-v4-1-flash",
    label: "DeepSeek V4.1 Flash",
    lab: "DeepSeek",
    endpoint: TOGETHER,
    model: "deepseek-ai/DeepSeek-V4.1-Flash",
    params: { thinking: { type: "disabled" }, reasoning_effort: "low", max_tokens: BUDGET },
  },
  {
    key: "nemotron-3-5-super",
    label: "Nemotron 3.5 Super",
    lab: "NVIDIA",
    endpoint: TOGETHER,
    model: "nvidia/NVIDIA-Nemotron-3.5-Super-VL",
    params: { chat_template_kwargs: { enable_thinking: false }, max_tokens: BUDGET },
  },
  {
    key: "muse-spark",
    label: "Muse Spark",
    lab: "Meta",
    endpoint: TOGETHER,
    model: "meta-models/Muse-Spark-Open-816B-A42B",
    // reasoning_effort "none" 会让它一个字都不返回，所以用 enabled: false。
    params: { reasoning: { enabled: false }, max_tokens: BUDGET },
  },
];

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** 预设是否还和表单里填的一致。 */
export function presetMatches(preset: Preset, endpoint: string, model: string): boolean {
  return preset.endpoint === endpoint.trim() && preset.model === model.trim();
}
