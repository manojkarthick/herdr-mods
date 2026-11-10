// Asks for a branch, runs `git gtr new` from the focused pane's folder and
// opens a space on the new checkout. Going through gtr gets its config for
// free: gtr.worktrees.dir, gtr.copy.include (.envrc, .env, ...), the default
// base branch and post-create hooks. Two ways in:
// - `mod.open:gtr` (a key): opens as the dialog;
// - a layout block: draws a tab-bar button that opens the dialog.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, spaces, focused, exec } from "herdr";

export default class Gtr extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    if (this.overlay) this.initDialog(cx);
  }

  initDialog(cx) {
    const f = focused();
    this.cwd = f?.cwd ?? null;
    this.machine = spaces().find((s) => s.id === f?.space)?.machine ?? null;
    this.repo = undefined; // undefined: looking, null: not usable here
    this.busy = false;
    this.error = "";
    this.text = "";
    this.input = InputState.new({ value: "", placeholder: "branch name" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      try {
        // gtr runs on this Mac; it can't create a checkout on another machine.
        if (this.machine) throw new Error(`This space is on ${this.machine}; only local repos are supported.`);
        if (!this.cwd) throw new Error("The focused pane has no folder.");
        const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: this.cwd });
        if (r.code !== 0) throw new Error(`${this.cwd} is not in a git repository.`);
        this.repo = r.stdout.trim().split("/").pop();
      } catch (e) {
        this.repo = null;
        this.error = String(e.message ?? e);
      }
      cx.notify();
      // The input only mounts once the repo is known; focus it after that frame.
      if (this.repo) cx.timer.after(100, () => this.input.focus());
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  go(cx) {
    const branch = this.text.trim();
    if (this.busy || !this.repo) return;
    if (!branch) { this.error = "Type a branch name."; return cx.notify(); }
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        // --porcelain implies --yes (no prompts) and prints `key<TAB>value` lines.
        const r = await exec("git", ["gtr", "new", branch, "--porcelain"], { cwd: this.cwd, timeout: 600_000 });
        const path = r.stdout.split("\n").find((l) => l.startsWith("path\t"))?.slice(5).trim();
        if (r.code !== 0 || !path) {
          const lines = (r.stderr || r.stdout).trim().split("\n");
          throw new Error(lines.filter((l) => /fatal|error|\[x\]/i.test(l)).join("\n") || lines.pop() || `git gtr new exited with ${r.code}`);
        }
        run("space.new", { folder: path, machine: "" });
        this.close();
      } catch (e) {
        this.error = String(e.message ?? e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    if (!this.overlay) {
      // Sits beside the shipped `tabs` block, so it copies that bar's
      // background and bottom border to read as one strip.
      return h_flex().size_full().items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
        .child(h_flex().id("new-gtr-worktree").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
          .text_size(12).bg(t.chrome).text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          // The block is a window-drag area; keep presses on the button.
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => run("mod.open", { name: "gtr" }))
          .child(svg("mods/gtr/worktree.svg").size(14))
          .child("Worktree"));
    }
    const ready = Boolean(this.repo);
    return v_flex()
      .id("gtr")
      .track_focus(this.handle)
      .on_key_down((e) => { if (e.key === "escape") this.close(); })
      .size_full()
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child(`New gtr worktree${ready ? ` of ${this.repo}` : ""}`))
      .when(this.repo === undefined, (el) => el.child(div().text_color(t.muted).child("…")))
      .when(ready, (el) =>
        el.child(div().text_color(t.muted).child("Runs git gtr new: copies gtr.copy.include files and branches from the default branch."))
          .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1).border_color(t.accent).bg(t.background).text_color(t.foreground)),
      )
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(
        h_flex()
          .justify_end()
          .gap(6)
          .text_size(11)
          .text_color(t.dim)
          .when(this.busy, (el) => el.child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)))
          .child(this.busy ? "working…" : ready ? "↵ create · esc cancel" : "esc close"),
      );
  }
}
