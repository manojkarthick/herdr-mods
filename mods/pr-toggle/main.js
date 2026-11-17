import { View, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, run, theme } from "herdr";

// Tab-bar button that shows and hides the layout's `pr-flow` block.
const BLOCK = "pr-flow";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class PrToggle extends View {
  render() {
    const t = theme();
    const block = find(layout(), BLOCK);
    const on = Boolean(block && !block.hidden);
    // Sits beside the shipped `tabs` block, so it copies that bar's
    // background and bottom border to read as one strip.
    return h_flex().size_full().items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-pr-flow").h(26).px(8).gap(4).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        // The block is a window-drag area; keep presses on the button.
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run(on ? "layout.hide" : "layout.show", { id: BLOCK }))
        .child(svg("mods/pr-flow/merge.svg").size(14))
        .child("PRs"));
  }
}
