export const id = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const id7 = (n: number): string =>
  `01a1f242-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
