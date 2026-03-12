## ScreenMemory — Draft Plan

*Built by a dev, for devs*

---

### The Problem

You finish a long day. You touched 6 repos, fixed 3 bugs, wrote bash scripts, reviewed PRs, had 2 meetings, and can't remember what you actually did for that standup tomorrow. Your git log helps but doesn't tell the whole story. Nothing does.

---

### Who This Is For

Developers who live in terminals, editors, and browsers across two monitors. People who want to answer *"what did I actually do today?"* without reconstructing it from memory.

---

### Real Life Scenarios

**Scenario 1 — Morning Standup**
> It's 9:45am. Standup in 15 minutes. You open ScreenMemory, hit "Summarize Yesterday" and it tells you: *"You spent ~3hrs on the FlyWP server provisioning script, pushed 4 commits, debugged an nginx config issue, and reviewed 2 PRs. Active from 10am–7pm with a 1hr break."* You copy that, done.

**Scenario 2 — Dual Monitor Dev Work**
> Your left monitor has VS Code + terminal. Right monitor has the browser, docs, and Slack. ScreenMemory captures both. When you scrub back through your day you can actually see both screens side by side — what you were coding AND what you were referencing at that moment.

**Scenario 3 — Git Context**
> You scroll to 3pm in the timeline. You see a terminal session. In the sidebar ScreenMemory shows: *"2 commits pushed to flywp/provisioning at 3:12pm — 'fix: nginx reload on SSL cert update'"* pulled straight from your local git history. The screenshot and the commit tell the same story together.

**Scenario 4 — End of Week Freelance Report**
> Friday 6pm. You ask ScreenMemory to summarize the week. It breaks down hours per project (it figured this out from git repos + window titles), gives you a timeline of active vs idle hours, and drafts a work log you can send to a client or paste into an invoice.

**Scenario 5 — "What was that thing I was looking at?"**
> You remember reading some docs about a Laravel queue driver Tuesday afternoon but can't find the tab. You scrub to Tuesday 2–4pm and visually scan through your browser frames until you spot it. Like rewinding a video.

---

### Core Features

**Dual monitor capture** — both screens recorded, shown side by side in the timeline. Not just the primary.

**Video-like timeline** — scrub through your day like a video. Hit play and watch your day fast-forward. Idle gaps are compressed so you're not watching a blank screen.

**Git integration** — reads your local git history and pins commits onto the timeline at the exact timestamp they happened. Scrubbing near a commit shows the message, repo, and diff stat in the sidebar.

**AI daily/weekly summary** — plugs into any provider you already use (OpenAI, Anthropic, Ollama for local). Tells you what you worked on, how long, and groups it by project. Not generic — it knows you were in `flywp/` for 4hrs because it saw your terminal and git commits.

**macOS menubar** — lives in your menubar, stays out of your way. One click to pause if you're doing something private. Green dot = recording, grey = paused.

**CLI-friendly** — you can query your own day from the terminal. `screenmemory summary --today`, `screenmemory commits --yesterday`. Useful for scripting your own standup or work log.

---

### What It Does NOT Do

- No cloud. Everything stays on your machine.
- No Windows, no Linux. macOS first, done right.
- No audio recording.
- Not a time tracker you have to manually start/stop.

---

### The AI Summary

You connect whatever AI provider you already have an API key for. You can also run it fully local via Ollama — no data leaves your machine at all.

The summary isn't just *"you used Chrome for 2 hours."* It reads your screen context plus git commits and produces something like:

> *"Between 10am and 1pm you worked on the FlyWP bash provisioning scripts, made 3 commits related to SSL handling. From 2–4pm you were debugging a Laravel queue issue, referencing the official docs and Stack Overflow. You had a 45min break around 1pm. Total active time: 6.5hrs."*

---

### Build Phases

**Phase 1 — It Works**
Capture both monitors, store screenshots, basic timeline you can scrub through. Shipped rough, used daily by me.

**Phase 2 — It's Useful**
Git integration, OCR sidebar, AI summary connected. This is the version worth showing someone.

**Phase 3 — It's Good**
CLI tool, storage management, auto-cleanup, polished menubar, DMG you can share.
