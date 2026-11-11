/**
 * Go through fields in order, and focus first ref with an error.
 */
export function focusFirstError<F extends string>(
  order: readonly F[],
  errors: Partial<Record<F, string>>,
  refs: Partial<Record<F, { current: HTMLElement | null }>>
): void {
  for (const field of order) {
    if (errors[field]) {
      refs[field]?.current?.focus();
      return;
    }
  }
}
