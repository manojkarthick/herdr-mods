import { View, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, focused, spaces, props, closeOverlay, notify, theme } from "herdr";

// Opens the focused terminal's live folder in Zed. Two ways in:
// - a layout block: draws a tab-bar button;
// - `mod.open:zed` (a key or the command palette): opens as a popup, launches Zed, closes itself.

async function openInZed() {
  const f = focused();
  const cwd = f?.cwd ?? null;
  const machine = spaces().find((s) => s.id === f?.space)?.machine ?? null;
  try {
    if (!cwd) throw new Error("The focused pane has no folder.");
    // The local `zed` can't open a folder on another machine's filesystem.
    if (machine) throw new Error(`This space is on ${machine}; only local folders are supported.`);
    const r = await exec("zed", [cwd]);
    if (r.code !== 0) throw new Error(r.stderr.trim() || `zed exited with ${r.code}`);
  } catch (e) {
    notify({ title: "Couldn't open in Zed", body: String(e.message ?? e), level: "error" });
  }
}

export default class Zed extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    if (this.overlay) {
      this.cwd = focused()?.cwd ?? null;
      cx.spawn(async () => {
        await openInZed();
        closeOverlay(this.overlay);
      });
    }
  }

  render() {
    const t = theme();
    if (this.overlay) {
      return h_flex().size_full().px(14).items_center().text_size(13).text_color(t.muted).truncate()
        .child(`Opening ${this.cwd ?? "…"} in Zed`);
    }
    // Sits beside the shipped `tabs` block, so it copies that bar's
    // background and bottom border to read as one strip.
    return h_flex().size_full().items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("open-in-zed").h(26).px(8).gap(7).flex_none().items_center().rounded(6)
        .text_size(12).bg(t.chrome).text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        // The block is a window-drag area; keep presses on the button.
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => cx.spawn(async () => { await openInZed(); }))
        .child(svg("mods/zed/zed.svg").size(14))
        .child("Zed"));
  }
}
