# Reference Teardown — Sugar Rush (*The Art of Wreck-It Ralph*)

Added by the user mid-session. Extracted 2026-08-25 from **book-page scans**, read as images —
not from memory of the film.

**Source:** alextoons.com scans of *The Art of Wreck-It Ralph* —
[Sugar Rush Concept Art pt.1](https://alextoons.com/blog/wreckitralphsugarrushconceptartpt1) ·
[pt.2](https://alextoons.com/blog/wreckitralphsugarrushconceptartpt2) ·
[Candy Racers and Go-Karts](https://alextoons.com/blog/wreckitralphsugarrushracersconceptart).
Art by Lorelay Bove, Helen Chen, Ryan Lang, Mike Gabriel, Victoria Ying, Cory Loftis, Mac George.

> **IP boundary.** Sugar Rush is Disney property. What is inherited here is *design thinking* and
> *palette discipline*. No characters, no likenesses, no kart designs, no logo, no lettering, and
> the name appears nowhere in the build. Same rule as any reference: take the craft, never the
> identity.

---

## 1. The thesis — quoted from the art book page titled "Sophisticated Palette"

> "The risk of creating a world completely out of confectionery foodstuffs, however, is that it
> might come off as **juvenile**. […] The artists needed an overall design for the world that was
> **sophisticated and original**. Using the traditional Hansel and Gretel gingerbread cottage was out."

**This is the single most important extraction on this page.** A candy racetrack for a developer
tool has exactly the same risk, and the art book states exactly how they avoided it. Every rule
below is a way of not being juvenile.

---

## 2. Palette discipline — the hard constraint

> "Instead of using every color of the rainbow, **pinks, reds, and chocolates are the hero colors
> of Sugar Rush.** Wherever we put too many colors and patterns together, it looked overwhelming,
> **like a little kid made it — not as yummy as if a pastry chef had.**"
> — Lorelay Bove

Three hero colour families. Not more. The restriction *is* the sophistication.

Convenient for this project: **bobby's existing brand red survives the move unchanged.** The
current bobbycode.com accent is a warm red, and red is a hero colour here.

---

## 3. Value structure — soft, not hard

> "You'll immediately notice it's all silky and smooth. If Hero's Duty is 'hard', then Sugar Rush
> is 'soft'. You're going from a metallic, sharp world into **creamy, even values**. **The pale
> orange and pink trees are very close to the cloud color, which is very close to the sky value.**
> If you squint your eyes, it looks like a wedding cake."
> — Mike Gabriel, art director

Low value contrast between adjacent elements. Sky, cloud and foliage sit within a narrow band.
Contrast is spent on *ink and the dark sections*, not scattered across the scenery.

---

## 4. Shape language — Gaudí, not gingerbread

Lorelay Bove brought the reference: Antoni Gaudí's curvilinear Barcelona architecture.

> "Those look like ice cream swirls, this looks like frosting, and there are pretzel shapes everywhere."

Curves, swirls, soft radii. Nothing metallic or sharp-edged. In CSS terms this argues for the
**small-but-present radii** railcode already uses, and against hard 0px industrial corners.

---

## 5. The method — the transferable technique

Three separate artists describe the same move: **find the real-world object whose existing form
already matches the thing you need, then build it from the world's material.**

| Artist | Need | Object whose form already fits | Result |
|---|---|---|---|
| Kevin Nelson | a race car per racer | "what genre of race car each type of candy naturally wanted to be" — candy corn on its side | a midget sprint car |
| Kevin Nelson | another | two Rice Krispies Treats, one higher than the other | a rat rod |
| Victoria Ying | grandstands | "the grocery store… **tiered shelves naturally look like grandstands**" | candy-shelf grandstand |
| Victoria Ying | the royal box | a popcorn box, "it's the type of food you'd eat at a race" | a royal popcorn box |
| Lorelay Bove | castle interior | "white and brown sugar cubes to create a **checkerboard** pattern" | sugar-cube checkerboard |

**What we take:** that last row is a direct bridge — a checkerboard built from two shades of sugar
is a checkered flag. And the method itself governs every illustrated object in the build: never
draw "a candy version of X"; find the confection whose form is already X.

---

## 6. Not extracted

- No hex values. These are painted film stills and gouache scans; sampling them would produce
  lighting, not a palette. The **relationships** above are the extraction — hero families, narrow
  value band, curvilinear shape. The hex values in the spec are ours, built to those rules, and
  are logged as such.
- Typography — `unknown`. The film's lettering is custom hand-lettering and is IP; not inherited.
