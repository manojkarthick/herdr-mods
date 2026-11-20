// Recherche: search past agent sessions through the local `recherche serve` API.
// One mod in three places: the ⌘⇧F popup (search, preview, resume), a transcript reader
// tab (props.screen "reader"), and a History badge in the tab bar.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle, TextView } from "gpui-base";
import { exec, focused, spaces, panes, run, props, closeOverlay, notify, theme, home, settings } from "herdr";
import * as api from "./api.js";
import { relative, repoFromRemote, sameHost, resumeCommand, tildify, firstLine, clip, chips, placeFor, toolLine, clock, day } from "./present.js";

const MOD = "recherche";
const mono = () => settings().font_family ?? "JetBrains Mono";
const AGENTS = [["", "Any"], ["claude", "Claude"], ["codex", "Codex"]];
const agentIcon = (a) => (a === "claude" || a === "codex" ? `icons/${a}.svg` : "mods/recherche/history.svg");

// The repo Recherche files a folder under: owner/name from origin, else the checkout's
// folder name. Remote spaces get none, since their folders aren't on this computer.
const repoCache = new Map();
async function repoHere() {
  const f = focused();
  if (!f?.cwd || spaces().find((s) => s.id === f.space)?.machine) return null;
  if (!repoCache.has(f.cwd)) {
    const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: f.cwd });
    let repo = origin.code === 0 ? repoFromRemote(origin.stdout) : null;
    if (!repo) {
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: f.cwd });
      repo = top.code === 0 ? top.stdout.trim().split("/").pop() : null;
    }
    repoCache.set(f.cwd, repo);
  }
  return repoCache.get(f.cwd);
}

let localHost;
async function hostName() {
  if (localHost === undefined) localHost = (await exec("hostname", ["-s"])).stdout.trim();
  return localHost;
}

// A new tab where a space already works in the session's folder, else a new space there.
function resume(s) {
  const name = clip(s.title || "Resumed session", 32);
  const place = placeFor(s.cwd, spaces(), panes(), focused()?.space);
  if (place) run("tab.new", { space: place.space ?? undefined, folder: s.cwd ?? undefined, argv: s.resume_argv, name });
  else run("space.new", { folder: s.cwd, argv: s.resume_argv, tab: name, machine: "" });
}

function copyResume(s, cx) {
  cx.write_to_clipboard(resumeCommand(s));
  notify({ title: "Copied resume command", body: resumeCommand(s), level: "success" });
}

function openReader(id, turn) {
  run("tab.new", { name: "Transcript", mod: MOD, props: { screen: "reader", id, turn } });
}

function button(t, id, label, onClick, { primary = false, disabled = false } = {}) {
  return h_flex()
    .id(id)
    .h(26)
    .px(10)
    .flex_none()
    .items_center()
    .rounded(6)
    .text_size(12)
    .when(primary && !disabled, (el) => el.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary && !disabled, (el) => el.border_1().border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
    .when(disabled, (el) => el.border_1().border_color(t.border).text_color(t.dim))
    .when(!disabled, (el) => el.cursor_pointer().on_click((_e, cx) => onClick(cx)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(label);
}

function chip(t, id, label, on, onClick) {
  return h_flex()
    .id(id)
    .h(22)
    .px(8)
    .flex_none()
    .items_center()
    .rounded(11)
    .text_size(11.5)
    .cursor_pointer()
    .when(on, (el) => el.bg(t.selected).text_color(t.foreground))
    .when(!on, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover)))
    .on_click((_e, cx) => onClick(cx))
    .child(label);
}

export default class Recherche extends View {
  init(_props, cx) {
    this.mode = props()?.screen === "reader" ? "reader" : props()?.overlay ? "popup" : "badge";
    this.req = 0;
    if (this.mode === "popup") this.initPopup(cx);
    else if (this.mode === "reader") this.initReader(cx);
    else this.initBadge(cx);
  }

  render(cx) {
    if (this.mode === "popup") return this.renderPopup(cx);
    if (this.mode === "reader") return this.renderReader(cx);
    return this.renderBadge(cx);
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  initPopup(cx) {
    this.query = "";
    this.scope = "repo";
    this.agent = "";
    this.repo = null;
    this.host = "";
    this.items = [];
    this.total = 0;
    this.at = 0;
    this.error = null;
    this.loading = true;
    this.details = new Map();
    this.typed = 0;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search past sessions…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      // Search once typing pauses; a newer keystroke cancels this one.
      const typed = ++this.typed;
      cx.timer.after(180, (cx) => typed === this.typed && this.search(cx));
    });
    this.input.on("submit", (e, cx) => {
      const s = this.selected();
      if (!s) return;
      if (e.secondary) this.openTranscript(s);
      else this.resumeSelected(cx);
    });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    cx.spawn(async (cx) => {
      [this.repo, this.host] = await Promise.all([repoHere(), hostName()]);
      if (!this.repo) this.scope = "all";
      this.search(cx);
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  selected() {
    return this.items[this.at]?.session;
  }

  search(cx) {
    const req = ++this.req;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await api.search({ q: this.query.trim(), repo: this.scope === "repo" ? this.repo : undefined, agent: this.agent });
        if (req !== this.req) return;
        this.items = r.items;
        this.total = r.total;
        this.error = null;
      } catch (e) {
        if (req !== this.req) return;
        this.items = [];
        this.error = e.message;
      }
      this.at = 0;
      this.loading = false;
      this.scroll.scroll_to_item(0);
      this.preview(cx);
      cx.notify();
    });
  }

  // The preview needs the full session (cwd, host, summary, entities); fetched once per id.
  preview(cx) {
    const id = this.selected()?.id;
    if (!id || this.details.has(id)) return;
    this.details.set(id, null);
    cx.spawn(async (cx) => {
      this.details.set(id, await api.session(id).catch((e) => ({ error: e.message })));
      cx.notify();
    });
  }

  // Resume needs cwd and argv from the full session, which may still be loading.
  async full(id) {
    const d = this.details.get(id);
    if (d && !d.error) return d;
    const s = await api.session(id);
    this.details.set(id, s);
    return s;
  }

  resumeSelected(cx) {
    const id = this.selected()?.id;
    if (!id) return;
    cx.spawn(async (cx) => {
      try {
        const s = await this.full(id);
        if (!sameHost(s.host, this.host)) return;
        this.close();
        resume(s);
      } catch (e) {
        notify({ title: "Couldn't resume", body: e.message, level: "error" });
      }
    });
  }

  copySelected(cx) {
    const id = this.selected()?.id;
    if (!id) return;
    cx.spawn(async (cx) => {
      try {
        copyResume(await this.full(id), cx);
      } catch (e) {
        notify({ title: "Couldn't copy", body: e.message, level: "error" });
      }
    });
  }

  openTranscript(s) {
    const turn = this.items[this.at]?.matching_turn_indexes?.[0];
    this.close();
    openReader(s.id, turn);
  }

  move(by, cx) {
    if (!this.items.length) return;
    this.at = Math.max(0, Math.min(this.items.length - 1, this.at + by));
    this.scroll.scroll_to_item(this.at);
    this.preview(cx);
    cx.notify();
  }

  setFilter(key, value, cx) {
    if (this[key] === value) return;
    this[key] = value;
    this.search(cx);
  }

  onKey(e, cx) {
    const key = e.key.toLowerCase();
    const m = e.modifiers ?? {};
    if (key === "escape") this.close();
    else if (key === "down") this.move(1, cx);
    else if (key === "up") this.move(-1, cx);
    else if (key === "tab" && this.repo) this.setFilter("scope", this.scope === "repo" ? "all" : "repo", cx);
    else if (key === "c" && m.platform && m.shift) this.copySelected(cx);
    else if (key === "o" && m.platform && this.selected()) cx.open_url(api.webUrl(this.selected().id));
    else return;
    cx.stop_propagation();
  }

  renderPopup(cx) {
    const t = theme();
    const sel = this.selected();
    return v_flex()
      .id("recherche")
      .track_focus(this.handle)
      .size_full()
      .min_h(0)
      .p(14)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .text_color(t.foreground)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .rounded(9)
          .border_1()
          .border_color(t.accent)
          .bg(t.background)
          .child(svg("mods/recherche/search.svg").size(15).flex_none().text_color(t.muted))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
          .child(
            div()
              .flex_none()
              .text_size(11.5)
              .text_color(t.dim)
              .child(this.loading ? "…" : this.error ? "" : `${this.total} session${this.total === 1 ? "" : "s"}`),
          ),
      )
      .child(
        h_flex()
          .flex_none()
          .gap(4)
          .items_center()
          .when(this.repo, (el) =>
            el
              .child(chip(t, "rc-scope-repo", `This repo · ${this.repo}`, this.scope === "repo", (cx) => this.setFilter("scope", "repo", cx)))
              .child(chip(t, "rc-scope-all", "All repos", this.scope === "all", (cx) => this.setFilter("scope", "all", cx)))
              .child(div().w(1).h(14).mx(6).bg(t.border)),
          )
          .children(AGENTS.map(([value, label]) => chip(t, `rc-agent-${label}`, label, this.agent === value, (cx) => this.setFilter("agent", value, cx)))),
      )
      .child(this.renderList(t))
      .child(sel ? this.renderPreview(t, sel) : div())
      .child(
        div()
          .flex_none()
          .text_size(11)
          .text_color(t.dim)
          .child("↵ resume · ⌘↵ transcript · ⌘⇧C copy command · ⌘O web" + (this.repo ? " · ⇥ scope" : "") + " · esc"),
      );
  }

  renderList(t) {
    // The popup sizes to its content, so the list needs a height of its own.
    const list = v_flex().id("rc-list").h(340).flex_none().overflow_y_scrollbar().track_scroll(this.scroll);
    if (this.error || (!this.loading && !this.items.length)) {
      return list.items_center().justify_center().gap(4).text_color(t.muted).child(this.error ?? "No sessions match.");
    }
    return list.children(
      this.items.map((item, i) => {
        const s = item.session;
        const on = i === this.at;
        return h_flex()
          .id(`rc-row-${s.id}`)
          .flex_none()
          .h(46)
          .px(10)
          .gap(10)
          .items_center()
          .rounded(7)
          .cursor_pointer()
          .when(on, (el) => el.bg(t.selected))
          .when(!on, (el) => el.hover((st) => st.bg(t.hover)))
          .on_click((e, cx) => {
            this.at = i;
            if (e.click_count >= 2) this.resumeSelected(cx);
            this.preview(cx);
            cx.notify();
          })
          .child(svg(agentIcon(s.agent)).size(16).flex_none().text_color(t.muted))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(2)
              .child(div().truncate().child(s.title || "Untitled session"))
              .child(div().truncate().text_size(11.5).text_color(t.dim).child([s.repo, ...(item.reasons ?? [])].filter(Boolean).join(" · "))),
          )
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(relative(s.ended ?? s.started)));
      }),
    );
  }

  renderPreview(t, sel) {
    const d = this.details.get(sel.id);
    const box = v_flex().flex_none().max_h(220).gap(8).pt(10).border_t(1).border_color(t.border);
    if (!d) return box.child(div().text_color(t.dim).child("Loading…"));
    if (d.error) return box.child(div().text_color(t.muted).child(d.error));
    const remote = !sameHost(d.host, this.host);
    const about = d.summary || d.recap;
    return box
      .when(about, (el) => el.child(div().text_size(12.5).text_color(t.muted).whitespace_normal().child(clip(about, 400))))
      .child(
        h_flex()
          .gap(6)
          .flex_wrap()
          .children(chips(d.entities).map((c) => div().px(7).py(2).rounded(5).bg(t.raised).text_size(11).text_color(t.muted).child(c.label))),
      )
      .child(
        div()
          .truncate()
          .font_family(mono())
          .text_size(11)
          .text_color(t.dim)
          .child(remote ? `Recorded on ${d.host}: resume it there` : `${tildify(d.cwd, home())} · ${d.turn_count} turns · ${d.model ?? d.agent}`),
      )
      .child(
        h_flex()
          .gap(6)
          .child(button(t, "rc-resume", "Resume", (cx) => this.resumeSelected(cx), { primary: true, disabled: remote }))
          .child(button(t, "rc-transcript", "Transcript", () => this.openTranscript(sel)))
          .child(button(t, "rc-copy", "Copy command", (cx) => this.copySelected(cx)))
          .child(button(t, "rc-web", "Web", (cx) => cx.open_url(api.webUrl(sel.id)))),
      );
  }

  // ── Reader ───────────────────────────────────────────────────────────────

  initReader(cx) {
    this.id = props().id;
    this.want = props().turn ?? null;
    this.session = null;
    this.turns = [];
    this.next = 0;
    this.error = null;
    this.jumped = false;
    this.openTools = new Set();
    this.scroll = ScrollHandle.new();
    cx.spawn(async (cx) => {
      try {
        this.session = await api.session(this.id);
        // Page in until the turn that matched the search is loaded, so the jump can land.
        do await this.loadPage(cx);
        while (this.next !== null && this.want !== null && !this.turns.some((x) => x.index === this.want));
      } catch (e) {
        this.error = e.message;
      }
      cx.notify();
    });
  }

  async loadPage(cx) {
    const r = await api.turns(this.id, this.next, 100);
    this.turns.push(...r.items);
    this.next = r.page?.next_offset ?? null;
    cx.notify();
  }

  renderReader(cx) {
    const t = theme();
    const s = this.session;
    const root = v_flex().size_full().min_h(0).bg(t.background).text_size(13).text_color(t.foreground);
    if (this.error) return root.items_center().justify_center().text_color(t.muted).child(this.error);
    if (!s) return root.items_center().justify_center().text_color(t.dim).child("Loading…");
    const at = this.turns.findIndex((x) => x.index === this.want);
    if (!this.jumped && at >= 0) {
      this.scroll.scroll_to_item(at);
      this.jumped = true;
    }
    return root
      .child(
        h_flex()
          .flex_none()
          .px(14)
          .py(10)
          .gap(10)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .bg(t.chrome)
          .child(svg(agentIcon(s.agent)).size(16).flex_none().text_color(t.muted))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().truncate().font_semibold().child(s.title || "Untitled session"))
              .child(div().truncate().text_size(11.5).text_color(t.dim).child([s.agent, `${s.turn_count} turns`, s.repo, relative(s.ended ?? s.started)].filter(Boolean).join(" · "))),
          )
          .child(button(t, "rd-resume", "Resume", () => resume(s), { primary: true, disabled: !sameHost(s.host, localHost) }))
          .child(button(t, "rd-copy", "Copy", (cx) => copyResume(s, cx)))
          .child(button(t, "rd-web", "Web", (cx) => cx.open_url(api.webUrl(s.id)))),
      )
      .child(
        v_flex()
          .id("rd-turns")
          .flex_1()
          .min_h(0)
          .px(18)
          .overflow_y_scrollbar()
          .track_scroll(this.scroll)
          .children(this.turns.map((turn, i) => this.renderTurn(t, turn, this.turns[i - 1])))
          .when(this.next !== null, (el) =>
            el.child(
              h_flex()
                .flex_none()
                .justify_center()
                .child(button(t, "rd-more", `Load more (${this.turns.length} of ${s.turn_count})`, (cx) => cx.spawn((cx) => this.loadPage(cx)))),
            ),
          ),
      );
  }

  // Laid out like the web transcript: a gutter says who wrote each message (with its
  // time, branch and whether it matched); your prompt sits on a shaded block, tool calls
  // fold into one line, and the agent's reply is plain text.
  renderTurn(t, turn, prev) {
    const hit = turn.index === this.want;
    const newDay = !prev || day(prev.timestamp) !== day(turn.timestamp);
    const gutter = (label, first) =>
      v_flex()
        .w(84)
        .flex_none()
        .gap(3)
        .pt(1)
        .text_size(11.5)
        .text_color(t.dim)
        .child(h_flex().gap(8).child(div().font_semibold().text_color(t.foreground).child(label)).when(first, (el) => el.child(clock(turn.timestamp))))
        .when(first && newDay, (el) => el.child(div().text_color(t.foreground).child(day(turn.timestamp))))
        .when(first && turn.branch, (el) => el.child(div().truncate().font_family(mono()).text_size(11).text_color(t.muted).child(turn.branch)))
        .when(first && hit, (el) => el.child(h_flex().child(div().px(5).rounded(3).bg(t.ansi3).text_size(11).text_color("#000000").child("Matched"))));
    const tools = turn.tools ?? [];
    const agent = this.session.agent === "codex" ? "Codex" : "Claude";
    return v_flex()
      .flex_none()
      .gap(12)
      .py(20)
      .border_b(1)
      .border_color(t.border)
      .when(turn.user, (el) =>
        el.child(
          h_flex()
            .items_start()
            .gap(16)
            .p(12)
            .rounded(8)
            .bg(t.raised)
            .border_l(3)
            .border_color(hit ? t.ansi3 : t.raised)
            .child(gutter("You", true))
            .child(div().flex_1().min_w(0).text_size(13.5).font_medium().whitespace_normal().child(clip(turn.user, 2000))),
        ),
      )
      .when(tools.length, (el) => el.child(this.renderTools(t, turn, tools)))
      // Long answers are cut: the reader is for finding your place, the web UI has the rest.
      .when(turn.assistant, (el) =>
        el.child(
          h_flex()
            .items_start()
            .gap(16)
            .px(15)
            .child(gutter(agent, !turn.user))
            .child(div().flex_1().min_w(0).child(TextView.markdown(`rd-a-${turn.index}`, clip(turn.assistant, 8000)))),
        ),
      );
  }

  renderTools(t, turn, tools) {
    const open = this.openTools.has(turn.index);
    const names = [...new Set(tools.map((x) => x.name))].join(", ");
    return h_flex()
      .items_start()
      .gap(16)
      .px(15)
      .child(div().w(84).flex_none().pt(2).text_size(11.5).font_semibold().text_color(t.foreground).child("Tools"))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(8)
          .child(
            h_flex()
              .id(`rd-tools-${turn.index}`)
              .gap(8)
              .px(6)
              .py(2)
              .rounded(5)
              .items_center()
              .cursor_pointer()
              .text_size(12)
              .text_color(t.muted)
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click((_e, cx) => {
                if (open) this.openTools.delete(turn.index);
                else this.openTools.add(turn.index);
                cx.notify();
              })
              .child(open ? "▾" : "▸")
              .child(div().flex_none().child(`${tools.length} tool call${tools.length === 1 ? "" : "s"}`))
              .child(div().flex_1().min_w(0).truncate().font_family(mono()).text_size(11.5).text_color(t.dim).child(names))
              .when(tools.some((x) => x.error), (el) => el.child(div().flex_none().text_color(t.blocked).child("failed"))),
          )
          .when(open, (el) =>
            el.child(
              v_flex()
                .gap(8)
                .pl(12)
                .border_l(2)
                .border_color(t.border)
                .children(
                  tools.map((x) =>
                    v_flex()
                      .gap(4)
                      .child(div().font_family(mono()).text_size(11.5).text_color(x.error ? t.blocked : t.foreground).whitespace_normal().child(toolLine(x)))
                      .when(x.output, (d) =>
                        d.child(
                          div()
                            .p(8)
                            .rounded(5)
                            .bg(t.raised)
                            .border_1()
                            .border_color(x.error ? t.blocked : t.border)
                            .font_family(mono())
                            .text_size(11)
                            .text_color(t.muted)
                            .whitespace_normal()
                            .child(clip(x.output, 1500)),
                        ),
                      ),
                  ),
                ),
            ),
          ),
      );
  }

  // ── Badge ────────────────────────────────────────────────────────────────

  initBadge(cx) {
    this.count = null;
    this.badgeCwd = undefined;
    // Sessions land while agents run; the count catches up every few minutes.
    cx.timer.every(5 * 60 * 1000, (cx) => this.refreshBadge(cx));
  }

  refreshBadge(cx) {
    const req = ++this.req;
    cx.spawn(async (cx) => {
      try {
        const repo = await repoHere();
        const r = await api.search({ repo: repo ?? undefined, limit: 1 });
        if (req === this.req) this.count = r.total;
      } catch {
        if (req === this.req) this.count = null;
      }
      cx.notify();
    });
  }

  renderBadge(cx) {
    const t = theme();
    // Mod panes have no folder; keep counting for the last terminal's repo.
    const cwd = focused()?.cwd ?? this.badgeCwd ?? null;
    if (cwd !== this.badgeCwd) {
      this.badgeCwd = cwd;
      this.refreshBadge(cx);
    }
    return h_flex()
      .size_full()
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("rc-badge")
          .h(26)
          .px(8)
          .gap(7)
          .flex_none()
          .items_center()
          .rounded(6)
          .text_size(12)
          .bg(t.chrome)
          .text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Search past sessions (⌘⇧F)")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => run("mod.open", { name: MOD }))
          .child(svg("mods/recherche/history.svg").size(14))
          .child("History")
          .when(this.count !== null, (el) => el.child(div().px(5).rounded(4).bg(t.raised).text_size(11).text_color(t.dim).child(String(this.count)))),
      );
  }
}
