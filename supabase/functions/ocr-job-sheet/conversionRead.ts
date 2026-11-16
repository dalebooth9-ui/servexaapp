// "Convert to digital report": read a handwritten sheet photo question by
// question. Every answerable field comes back either read (confident) or with
// a best guess + low confidence so the reviewer is asked to check it — never
// silently blank. Uses the strongest available image model, and retries once
// on zoomed strips of the cleaned page when the first read is thin.

type Img = { image_base64: string; mime_type?: string };
type Field = { id: string; label: string; type: string; section?: string; options?: string[] };

export type ConversionAnswer = {
  field_id: string;
  value: string | null;
  best_guess: string | null;
  confidence: number;
  box: { x: number; y: number; w: number; h: number } | null; // % of the cleaned page
  note?: string | null;
};

export type ConversionResult = {
  answers: Record<string, ConversionAnswer>;
  header: Record<string, any>;
  unreadable: boolean;
  unreadable_reason: string | null;
  passes: number;
  model: string;
};

const MODELS = ["google/gemini-3.1-pro-preview", "google/gemini-2.5-pro"];
const SKIP = new Set(["signature", "photo", "photos", "image", "heading", "section", "info", "file", "repeating_table"]);

export const answerFields = (fields: Field[]) => (fields || []).filter((f) => !SKIP.has(String(f.type).toLowerCase()));

function optionsFor(f: Field): string {
  const t = String(f.type).toLowerCase();
  if (t === "checkbox") return "YES / NO / N/A (or the exact handwritten exception, e.g. NO ACCESS)";
  if (t === "pass_fail") return "PASS / FAIL / N/A";
  if (t === "number") return "a number";
  if (f.options?.length) return f.options.join(" / ");
  return "free text exactly as written";
}

function tool() {
  return {
    type: "function",
    function: {
      name: "record_sheet",
      description: "Record every question on the sheet.",
      parameters: {
        type: "object",
        properties: {
          photo_readable: { type: "boolean", description: "false ONLY if the photo is so poor that almost nothing on the form can be made out." },
          unreadable_reason: { type: "string", description: "If parts could not be read, say which parts and why (blur, glare, cut off, dark)." },
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field_id: { type: "string" },
                value: { type: ["string", "null"], description: "The answer when the mark/writing is clearly visible. null when unsure." },
                best_guess: { type: ["string", "null"], description: "Your most likely answer even when unsure (null only if the row is completely invisible or blank on paper)." },
                confidence: { type: "number", description: "0.0–1.0 that value/best_guess matches the paper." },
                box: {
                  type: ["object", "null"],
                  description: "Bounding box of this question's ROW (label + answer marks) as percentages 0–100 of THIS image.",
                  properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
                  required: ["x", "y", "w", "h"],
                },
                note: { type: ["string", "null"], description: "Why it is unclear, if it is." },
              },
              required: ["field_id", "value", "best_guess", "confidence", "box"],
            },
          },
          header: {
            type: "object",
            properties: {
              date: { type: "string" }, engineer: { type: "string" }, customer: { type: "string" },
              site: { type: "string" }, po_ref: { type: "string" }, riser_location: { type: "string" },
              number_of_outlets: { type: "string" }, customer_signed_name: { type: "string" },
            },
          },
        },
        required: ["photo_readable", "answers"],
      },
    },
  };
}

function prompt(templateName: string, fields: Field[], part: string) {
  const list = answerFields(fields)
    .map((f) => `- ${f.id} | ${f.section ? `[${f.section}] ` : ""}${f.label} | answer: ${optionsFor(f)}`)
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);
  return `You are reading a photo of a handwritten UK fire-safety inspection sheet ("${templateName}"). Today is ${today}.
The photo may be taken at an angle, in poor light, with glare or blur. ${part}

For EVERY question below return one entry in "answers" (use the exact field_id):
- Work out which printed option is circled, ticked, underlined, crossed or written beside the question. A strikethrough through one option means the OTHER option. A tick in a column means that column's option.
- Valve type / multiple-choice boxes: return the ticked option text.
- Number of outlets and similar counts: return the digits.
- "value": only when you can clearly see the mark. Otherwise null.
- "best_guess": ALWAYS give your most likely reading if there is any mark at all, even faint. Use null only when the row is genuinely blank on paper or not visible in this image.
- "confidence": ≥0.85 clear; 0.6–0.85 fairly sure; <0.6 unsure.
- "box": the question row's position in THIS image as percentages.
- Notes/comments: transcribe verbatim. Never copy the template name into an answer. Do not invent marks.
- If a question is not in this image at all, still return it with value null, best_guess null, confidence 0, box null.

Questions (field_id | label | answer format):
${list}`;
}

async function callModel(apiKey: string, images: Img[], text: string): Promise<{ data: any; model: string } | null> {
  for (const model of MODELS) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime_type || "image/jpeg"};base64,${i.image_base64}` } })),
          ],
        }],
        tools: [tool()],
        tool_choice: { type: "function", function: { name: "record_sheet" } },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[conversion] ${model} ${res.status} ${body.slice(0, 200)}`);
      if (res.status === 402 || res.status === 403) throw new Error(`AI error: ${res.status}`);
      continue;
    }
    try {
      const j = await res.json();
      const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;
      return { data: typeof args === "string" ? JSON.parse(args) : args, model };
    } catch (e) {
      console.warn(`[conversion] ${model} parse failed`, e);
    }
  }
  return null;
}

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

function collect(data: any, known: Set<string>, mapBox?: (b: any) => any): Record<string, ConversionAnswer> {
  const out: Record<string, ConversionAnswer> = {};
  for (const a of Array.isArray(data?.answers) ? data.answers : []) {
    if (!a || !known.has(a.field_id)) continue;
    const c = Number(a.confidence);
    out[a.field_id] = {
      field_id: a.field_id,
      value: blank(a.value) ? null : String(a.value),
      best_guess: blank(a.best_guess) ? (blank(a.value) ? null : String(a.value)) : String(a.best_guess),
      confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0,
      box: a.box && Number.isFinite(Number(a.box.y)) ? (mapBox ? mapBox(a.box) : a.box) : null,
      note: a.note ?? null,
    };
  }
  return out;
}

export const countRead = (answers: Record<string, ConversionAnswer>) =>
  Object.values(answers).filter((a) => a.value !== null && a.confidence >= 0.6).length;

/** Prefer the entry that actually read something, then the more confident. */
export function mergeAnswers(a: Record<string, ConversionAnswer>, b: Record<string, ConversionAnswer>) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    const score = (x?: ConversionAnswer) => (x ? (x.value !== null ? 1 : x.best_guess !== null ? 0.5 : 0) + x.confidence : -1);
    if (score(v) > score(cur)) out[k] = { ...v, box: v.box || cur?.box || null };
  }
  return out;
}

export async function readHandwrittenSheet(opts: {
  apiKey: string;
  enhanced: Img;
  original?: Img | null;
  strips: Img[];
  stripBounds: Array<{ y: number; h: number }>; // % of page
  templateName: string;
  fields: Field[];
}): Promise<ConversionResult> {
  const fields = answerFields(opts.fields);
  const known = new Set(fields.map((f) => f.id));
  const first = await callModel(
    opts.apiKey,
    [opts.enhanced, ...(opts.original ? [opts.original] : [])],
    prompt(opts.templateName, fields, "Image 1 is a cleaned-up (straightened, contrast-boosted) copy; image 2, if present, is the original photo — use it when the cleaned copy lost a faint mark. Give boxes relative to image 1."),
  );
  let answers = first ? collect(first.data, known) : {};
  let header = first?.data?.header || {};
  let model = first?.model || "";
  let passes = 1;
  const readable = first?.data?.photo_readable !== false;
  let reason: string | null = first?.data?.unreadable_reason || null;

  // Thin or empty first read → zoom in on each strip of the page.
  if (opts.strips.length && countRead(answers) < Math.max(3, Math.ceil(fields.length * 0.5))) {
    passes = 2;
    const parts = await Promise.all(opts.strips.map((s, i) =>
      callModel(opts.apiKey, [s], prompt(opts.templateName, fields, `This image is ZOOMED section ${i + 1} of ${opts.strips.length} (top to bottom) of the sheet. Only answer questions visible in this section; give boxes relative to this section.`))
        .catch((e) => { console.warn("[conversion] strip failed", e); return null; }),
    ));
    parts.forEach((p, i) => {
      if (!p) return;
      const sb = opts.stripBounds[i] || { y: 0, h: 100 };
      answers = mergeAnswers(answers, collect(p.data, known, (b) => ({ x: b.x, w: b.w, y: sb.y + (b.y * sb.h) / 100, h: (b.h * sb.h) / 100 })));
      header = { ...(p.data?.header || {}), ...Object.fromEntries(Object.entries(header).filter(([, v]) => !blank(v))) };
      model = model || p.model;
    });
  }

  const anything = Object.values(answers).some((a) => a.value !== null || a.best_guess !== null);
  return {
    answers,
    header,
    unreadable: !anything || !readable,
    unreadable_reason: !anything ? (reason || "Nothing on the sheet could be made out.") : (!readable ? reason : reason),
    passes,
    model,
  };
}
