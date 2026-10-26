# Reference Set — Sam dashboard

**Job:** design-research · **Selected by:** agent (user supplied none)
**Method:** all rendered live at 1440×900 with Playwright and read.

> Deliberately **real running interfaces**, not marketing pages about interfaces. Everything
> this skill has been tested on so far was a marketing page; a dashboard is scanned and
> operated, so the references have to be operable things.

## The set

| Reference | Source | What's good — the *thinking* | What we take |
|---|---|---|---|
| **Plausible** (live demo) | [plausible.io/plausible.io](https://plausible.io/plausible.io) | A dashboard that answers the question before you ask it. Summary first, detail below, and **liveness stated as a fact** — "● 44 current visitors" sits in the header, not in a widget. | Stat-tile row with deltas · the live indicator · **inline magnitude bars inside list rows** · tabbed triage panels |
| **Grafana Play** | [play.grafana.org](https://play.grafana.org/) | The **app shell**: collapsible sectioned nav, breadcrumb trail, ⌘K search, everything in resizable panels. It reads as software you operate, not a page you visit. | Left nav with sections · breadcrumb · panel-grid composition · dark operator ground |
| **Linear** | [linear.app](https://linear.app/) | Density without noise. 97 interactive controls on one screen and it still feels calm — achieved with tiny type, tight rows, and almost no borders. | Row density · restraint in dividers · keyboard-first affordances |
| **Raycast** | [raycast.com](https://www.raycast.com/) | **Local-first, keyboard-first, dark.** A tool that lives on your machine and says so. | The local/native register — a real app on a real computer, not a tab |

## Honest limitations

- **Grafana Play's home is a promo page inside the app chrome**, not a live data dashboard.
  Its value here is the shell, not the data design. Marked accordingly.
- **Linear and Raycast are marketing pages** for their products — the real UIs need auth. What
  we take from them is visible in their product shots and their type/density decisions, not
  from an extracted running interface. Lower confidence than Plausible.
- **Plausible is the only fully live, fully inspectable dashboard in the set**, so it carries
  the most weight.

## Category norm

Job-search tools are either job *boards* (search results, endless listings, ads) or ATS
pipelines (kanban of applications). Both assume you are doing the looking.

## How this will differ

Sam already did the looking. So the dashboard is **not a search interface** — it is a
**briefing**: what arrived while you were away, what is ready to send, what is going stale.
Closer to an inbox or an ops console than to a job board.
