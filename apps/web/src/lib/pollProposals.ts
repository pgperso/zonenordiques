// Validation + normalization for AI-proposed polls. Kept separate from the
// route handler so it can be unit-tested, and so it applies equally whether
// the proposals arrive via tool-use input or a legacy JSON parse.

export interface PollProposal {
  question: string;
  options: string[];
}

const MAX_QUESTION_LEN = 300;
const MAX_OPTION_LEN = 120;
const MIN_QUESTION_LEN = 5;
const MIN_OPTIONS = 2;

/**
 * Coerce an untrusted value into a clean list of poll proposals.
 *
 * Accepts either an array of proposals or a `{ polls: [...] }` wrapper.
 * Each proposal is trimmed and length-capped; options are de-blanked and
 * limited to `maxOptions`. Proposals without a real question or at least
 * two options are dropped. Always returns a (possibly empty) array.
 */
export function normalizePollProposals(raw: unknown, maxOptions: number): PollProposal[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { polls?: unknown })?.polls)
      ? (raw as { polls: unknown[] }).polls
      : null;
  if (!list) return [];

  return list
    .filter(
      (p): p is { question: string; options: unknown[] } =>
        !!p &&
        typeof (p as { question?: unknown }).question === 'string' &&
        Array.isArray((p as { options?: unknown }).options),
    )
    .map((p) => ({
      question: p.question.trim().slice(0, MAX_QUESTION_LEN),
      options: p.options
        .filter((o): o is string => typeof o === 'string')
        .map((o) => o.trim().slice(0, MAX_OPTION_LEN))
        .filter(Boolean)
        .slice(0, maxOptions),
    }))
    .filter((p) => p.question.length >= MIN_QUESTION_LEN && p.options.length >= MIN_OPTIONS);
}
