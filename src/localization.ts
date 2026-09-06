import { localeFrom, translateText, type Locale } from "./i18n";
type Source = { source: string; rendered: string };
/** Translate authored text without rebuilding grids or resetting application state. */
export class Localization {
  private locale: Locale;
  private textSources = new WeakMap<Text, Source>();
  private attributeSources = new WeakMap<Element, Map<string, Source>>();
  private observer: MutationObserver;
  constructor(
    private root: HTMLElement,
    locale: Locale,
  ) {
    this.locale = localeFrom(locale);
    this.walk(root);
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === "characterData" &&
          record.target.nodeType === Node.TEXT_NODE
        )
          this.text(record.target as Text);
        else if (record.type === "attributes")
          this.attributes(record.target as Element);
        else for (const node of Array.from(record.addedNodes)) this.walk(node);
      }
    });
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder", "alt"],
    });
    document.documentElement.lang = this.locale;
  }
  get current() {
    return this.locale;
  }
  setLocale(value: Locale) {
    this.locale = localeFrom(value);
    document.documentElement.lang = this.locale;
    this.walk(this.root);
  }
  disconnect() {
    this.observer.disconnect();
  }
  private normalize(value: string) {
    return value.replace(/\s+/g, " ").trim();
  }
  private text(node: Text) {
    if (node.parentElement?.closest("script,style,code,pre,[data-no-i18n]"))
      return;
    let entry = this.textSources.get(node);
    if (!entry || node.data !== entry.rendered) {
      entry = { source: node.data, rendered: node.data };
      this.textSources.set(node, entry);
    }
    const key = this.normalize(entry.source);
    const translated = translateText(this.locale, key);
    const rendered =
      translated === key
        ? entry.source
        : entry.source.replace(entry.source.trim(), translated);
    entry.rendered = rendered;
    if (node.data !== rendered) node.data = rendered;
  }
  private attributes(element: Element) {
    let entries = this.attributeSources.get(element);
    if (!entries) {
      entries = new Map();
      this.attributeSources.set(element, entries);
    }
    for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
      const value = element.getAttribute(attr);
      if (value === null) continue;
      let entry = entries.get(attr);
      if (!entry || value !== entry.rendered) {
        entry = { source: value, rendered: value };
        entries.set(attr, entry);
      }
      const rendered = translateText(this.locale, this.normalize(entry.source));
      entry.rendered = rendered;
      if (value !== rendered) element.setAttribute(attr, rendered);
    }
  }
  private walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      this.text(node as Text);
      return;
    }
    if (node instanceof Element) this.attributes(node);
    for (const child of Array.from(node.childNodes)) this.walk(child);
  }
}
