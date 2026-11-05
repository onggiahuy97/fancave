type Attrs = Record<string, string | number | boolean | undefined>;

/** Tiny DOM helper: el('button.primary', { type: 'button' }, 'Go'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const [tagAndId, ...classes] = spec.split('.');
  const [tag, id] = (tagAndId ?? 'div').split('#');
  const node = document.createElement((tag ?? 'div') as K);
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

export const isTouchDevice = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches ||
  new URLSearchParams(location.search).has('touch');
