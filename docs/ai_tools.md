# AI tools: state

Single source of truth for what the AI category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`. AI has **2 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid.

This category is for tools built around what an AI image or video generator leaves behind
(watermarks today), not a general "AI features" catch all. A new entry here should fit that
same shape: cleanup work specific to AI generated media.

Everything runs in the browser. Nothing is uploaded.

## Checklist

- [x] Gemini Watermark Remover — `gemini-watermark-remover`
- [x] Gemini Video Watermark Remover — `gemini-video-watermark-remover`

## AI Tools

### 1. Gemini Watermark Remover — `gemini-watermark-remover`

**Built.** Removes the Gemini sparkle watermark from an image automatically — detection is
automatic and removal is an exact algebraic reverse of the blend Gemini used to add the mark,
not a blur or a clone stamp.

| Feature | Details |
| --- | --- |
| Detection | Looks the source image's dimensions up against a catalog of Gemini's known output sizes and their watermark position/size, rather than searching the frame. |
| Removal | Inverts the actual composite blend Gemini used (`original = (composited - alpha * logo) / (1 - alpha)`) using a captured alpha template, not a heuristic blur. |
| Verification | Correlation scoring confirms a removal worked before it is shown as the result. |

Full implementation record, including what is ported from the MIT licensed reference project
and what is not yet: `docs/gemini_watermark_remover_approach.md`.

### 2. Gemini Video Watermark Remover — `gemini-video-watermark-remover`

**Built.** The same removal approach applied to every frame of a video automatically, with
audio kept unchanged.

| Feature | Details |
| --- | --- |
| Per frame removal | Every frame runs through the same detection and inversion as the image tool. |
| Audio | Passed through unchanged; only the video stream is touched. |

Shares its pipeline notes with the image tool in
`docs/gemini_watermark_remover_approach.md`.

## Shared conventions to build against

- Every result offers a view/preview action and a download action, same as every other
  category.
- A before/after comparison (`components/tool_workspace/before_after_modal.tsx`) is required
  wherever a tool edits an image or video in place, so a person can confirm the fix without
  downloading first.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
