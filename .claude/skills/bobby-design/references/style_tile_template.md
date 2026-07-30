# Style Tile Template

What goes on each tile, and how to present the set.

A style tile shows the **visual language** — color, type, and real UI atoms — **without a page layout**. It is the cheap decision that prevents an expensive wrong build.

---

## The set

Produce **2–3 tiles**, published together as one artifact so they can be compared side by side.

**Rules for the set:**

- Each tile anchors to a **different reference remix** — not three shades of the same idea. If two tiles could be described the same way, one of them is wasted.
- The set differs on a **named axis**, and you state the axis out loud: *warm ↔ austere*, *classic ↔ experimental*, *quiet ↔ loud*, *editorial ↔ utilitarian*.
- All tiles use the **same content** (same headline, same button label, same card). Only the design varies — otherwise the user is comparing copy, not direction.
- **No full page layout.** No hero-plus-features composition. Layout is step 4.

---

## What goes on each tile

### 1. Name and thesis

A short name (one or two words) and one line of **what this says about you**.

> **Whiteroom** — "We are serious, and we do not need to shout."

### 1b. Sources — required on the tile

Name the references this direction was built from, with links. Put them **on the tile**, visible.

> *Built from: [rfeasley.io](https://rfeasley.io) (restraint in service of a point of view) · [Charm](https://charm.land) (the terminal deserves art direction)*

A tile that cannot name its sources was invented from taste rather than remixed from references — which is the default look in disguise. If you cannot fill this in, go back to step 2.

### 2. Color

Every swatch labeled with its **role** and its **hex**. Roles, not just colors:

- Ground (the 60%)
- Ink / text
- Muted ink
- Rule / border
- **Anchor accent** (the 10%)
- Semantic colors if the subject needs them

Show them at their real proportions if you can — a strip that is mostly ground with a sliver of accent tells the truth about the palette better than six equal squares.

### 3. Type

- **Display face** — set large, in a real headline from the actual subject
- **Body face** — a real paragraph of real copy, at real size
- **Utility face** if there is one (mono, captions, labels)
- Name the faces, and name the **fallback** if a webfont is not available
- Show the scale: an H1, an H2, body, and a small label

### 4. Real UI atoms, in real states

This is what makes a tile decidable for a non-designer. Show actual components, not descriptions:

- **Primary button** — default *and* hover
- **Secondary / ghost button**
- **Link** — inline, with its underline treatment
- **Card** — with real content in it
- **Label / eyebrow / tag**
- **Input** — with its focus state visible
- Anything else central to this subject (a status pill, a price, a nav)

### 5. Texture and detail

The small decisions that carry a lot of the feel:

- Border radius (and whether it is consistent or deliberately varied)
- Border weight and color
- Shadow treatment — or the explicit absence of one
- Iconography style, if icons are used
- Any motif or pattern

### 6. Mood adjectives

Three to five words. This gives the user language to react with when they do not have design vocabulary.

> *Restrained · confident · editorial · quiet*

### 7. The signature move

Name the one deliberate, subject-specific idea this direction hangs on. One sentence.

> **Signature move:** the headline is set in monospace, because for a CLI the terminal *is* the interface.

---

## Presenting the set

Publish as a single artifact. For each tile, in order: name → thesis → color → type → atoms → texture → adjectives → signature move.

Then ask exactly one question, in plain language:

> **"Which of these feels right? You can also mix — 'A but with C's type' is a perfectly good answer."**

Do **not** ask which fonts they prefer, which hex they like, or how they would change it. They pick; you translate.

---

## After the pick

Record, in writing:

- Which tile won (and what was mixed in, if anything)
- The **signature move** that carries forward
- The named axis position they chose — this is useful shorthand for later feedback ("more like A" means something now)

Then take the winning tile straight into **step 5, tokens**. The tile is not the design system yet — it is the decision that lets you build one.

---

## Quality bar for tiles

Tiles are fast, but they are not sloppy. A tile that is too rough to judge has failed at its only job.

- [ ] All 2–3 tiles use identical content, so only design varies
- [ ] Each tile is anchored to a different reference remix
- [ ] **Every tile names its sources, with links, visibly on the tile**
- [ ] Every reference was actually looked at — none are working from memory
- [ ] The differentiating axis is named
- [ ] Every color swatch is labeled with role + hex
- [ ] Type is shown with real copy, not "The quick brown fox"
- [ ] Buttons show hover; inputs show focus
- [ ] Each tile names its signature move
- [ ] No tile uses anything from the avoid-list in `craft_principles.md`
- [ ] The artifact itself is theme-aware, or deliberately commits to a single ground
