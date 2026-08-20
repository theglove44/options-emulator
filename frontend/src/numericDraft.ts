export interface NumericDraftCommitOptions {
  minimum: number;
  maximum?: number;
  allowEmpty?: boolean;
}

export interface NumericDraftCommit {
  accepted: boolean;
  value: number | null;
  draft: string;
}

export function commitNumericDraft(
  draft: string,
  lastValid: number | null,
  options: NumericDraftCommitOptions
): NumericDraftCommit {
  const trimmed = draft.trim();
  if (!trimmed) {
    if (options.allowEmpty) return { accepted: true, value: null, draft: "" };
    return { accepted: false, value: lastValid, draft: formatDraft(lastValid) };
  }
  const parsed = Number(trimmed);
  const maximum = options.maximum ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(parsed) || parsed < options.minimum || parsed > maximum) {
    return { accepted: false, value: lastValid, draft: formatDraft(lastValid) };
  }
  return { accepted: true, value: parsed, draft: trimmed };
}

export function formatDraft(value: number | null, fractionDigits?: number): string {
  if (value == null) return "";
  return fractionDigits == null ? String(value) : value.toFixed(fractionDigits);
}
