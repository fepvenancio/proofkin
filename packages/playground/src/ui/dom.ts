// A tiny DOM builder. Everything goes in as text or as nodes, never as an HTML string.
export type Child = Node | string | number | false | null | undefined;
type Prop = string | number | boolean | EventListener | null | undefined;

const toNode = (c: Exclude<Child, false | null | undefined>): Node => (c instanceof Node ? c : document.createTextNode(String(c)));
const present = (c: Child): c is Exclude<Child, false | null | undefined> => c !== false && c !== null && c !== undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, Prop> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.replace(/^on/, "").toLowerCase(), value);
    else if (key === "class") el.className = String(value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  el.append(...children.filter(present).map(toNode));
  return el;
}

/** Replace an element's contents. */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...children.filter(present).map(toNode));
}

/** Parses markup that is a constant in this codebase (the GRID_PATH diagram), never anything from the network. */
export function trustedSvg(markup: string): SVGElement {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  return document.importNode(doc.documentElement as unknown as SVGElement, true);
}

export const svgDataUri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
