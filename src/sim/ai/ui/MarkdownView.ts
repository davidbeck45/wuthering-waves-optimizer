// Wuthering Tools+ AI — renders `markdown.ts`'s AST as VNodes. Every piece of model text becomes a text node
// (Vue escapes it); there is no v-html / innerHTML anywhere on this path. Links: external ones open in a new tab
// with rel="noopener noreferrer nofollow"; in-app routes go through the router (and emit `navigate` so a phone
// sheet can step aside).
import { computed, defineComponent, h, type PropType, type VNode } from "vue";
import { useRouter } from "vue-router";
import { parseMarkdown, type Block, type Inline } from "./markdown";

export default defineComponent({
  name: "MarkdownView",
  props: {
    source: { type: String, required: true },
    /** true while the answer is still streaming (a caret is drawn after the last block) */
    streaming: { type: Boolean, default: false },
    /** an in-app route the router knows; anything else that starts with "/" stays text */
    isRoute: { type: Function as PropType<(path: string) => boolean>, default: undefined }, // eslint-disable-line no-unused-vars -- the parameter of a function type
  },
  emits: ["navigate"],
  setup(props, { emit }) {
    const router = useRouter();
    const blocks = computed(() => parseMarkdown(props.source, { isRoute: props.isRoute }));

    const go = (event: MouseEvent, path: string): void => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // let the browser open a new tab
      event.preventDefault();
      emit("navigate", path);
      void router?.push(path);
    };

    const routeLink = (path: string, children: Array<VNode | string>, extra = ""): VNode =>
      h("a", { href: path, class: `link link-primary font-medium ${extra}`, "data-test-ai-route-link": path, onClick: (e: MouseEvent) => go(e, path) }, children);

    const inline = (nodes: Inline[]): Array<VNode | string> =>
      nodes.map((n): VNode | string => {
        switch (n.t) {
          case "text":
            return n.v;
          case "br":
            return h("br");
          case "strong":
            return h("strong", { class: "font-semibold text-base-content" }, inline(n.c));
          case "em":
            return h("em", inline(n.c));
          case "code": {
            const code = h("code", { class: "ai-md__code rounded bg-base-300/70 px-1 py-px font-mono text-[0.85em]" }, n.v);
            return n.route ? routeLink(n.route, [code], "no-underline") : code;
          }
          case "link":
            return n.kind === "route"
              ? routeLink(n.href, inline(n.c))
              : h("a", { href: n.href, target: "_blank", rel: "noopener noreferrer nofollow", class: "link link-primary break-words" }, inline(n.c));
        }
      });

    const block = (b: Block, key: number): VNode => {
      switch (b.t) {
        case "p":
          return h("p", { key, class: "ai-md__p" }, inline(b.c));
        case "h":
          return h(b.level <= 2 ? "h3" : "h4", { key, class: b.level <= 2 ? "ai-md__h text-[0.95rem] font-semibold" : "ai-md__h text-sm font-semibold" }, inline(b.c));
        case "hr":
          return h("hr", { key, class: "border-base-300" });
        case "code":
          return h("div", { key, class: "ai-md__pre relative" }, [
            b.lang ? h("span", { class: "absolute right-2 top-1 text-[10px] uppercase tracking-wide opacity-50" }, b.lang) : null,
            h("pre", { class: "overflow-x-auto rounded-lg bg-base-300/70 p-3 font-mono text-xs leading-relaxed" }, [h("code", b.v)]),
          ]);
        case "quote":
          return h("blockquote", { key, class: "border-l-2 border-primary/40 pl-3 opacity-90" }, b.c.map(block));
        case "list":
          return h(
            b.ordered ? "ol" : "ul",
            { key, class: b.ordered ? "ai-md__list list-decimal pl-5" : "ai-md__list list-disc pl-5", ...(b.ordered && b.start !== 1 ? { start: b.start } : {}) },
            b.items.map((item, i) => h("li", { key: i, class: "pl-0.5" }, [...inline(item.c), item.sub ? block(item.sub, 0) : null])),
          );
        case "table":
          return h("div", { key, class: "ai-md__table overflow-x-auto rounded-lg border border-base-300" }, [
            h("table", { class: "table table-xs w-full" }, [
              h("thead", [h("tr", b.head.map((c, i) => h("th", { key: i, class: alignClass(b.align[i]) }, inline(c))))]),
              h(
                "tbody",
                b.rows.map((row, r) => h("tr", { key: r }, row.map((c, i) => h("td", { key: i, class: `${alignClass(b.align[i])} tabular-nums` }, inline(c))))),
              ),
            ]),
          ]);
      }
    };

    return () =>
      h("div", { class: ["ai-md", props.streaming ? "ai-md--streaming" : null] }, blocks.value.length ? blocks.value.map(block) : props.streaming ? [h("p", { class: "ai-md__p" })] : []);
  },
});

function alignClass(align: "left" | "center" | "right" | null): string {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}
