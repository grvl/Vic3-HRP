# Victoria 3 — Ideology Affinity Groups

A static, no-build visualizer for the Victoria 3 character-ideology affinity sheet.
Pick an ideology and see every bond and rivalry it inherits from the groups it belongs to.

**The spreadsheet is the source of truth.** The page reads it on every load, so editing
the sheet updates the site — no commit, no deploy.

## Views

| View | What it shows |
| --- | --- |
| **Ideologies** | Pick one → its groups, then **Bonds** (allies only), **Frenemies** (both at once) and **Rivalries** (enemies only), each annotated with the group or rivalry line it came from. Cards are clickable, so you can walk the graph. |
| **Groups** | Every affinity group by classification, with its bond level and members. |
| **Rivalry lines** | The raw group-vs-group lines, split by level. |
| **Matrix** | All ideologies against all others. Digits are bond levels, `✕` existential rivalry, `–` antagonism; split cells are both at once. |
| **Notes** | The `Details` tab from the sheet, plus level legends and any alternate group names. |

Other bits: search (`/` to focus), light/dark toggle, deep links (`#/i/Communist`,
`#/groups/G03`), a refresh button that bypasses the cache, and full mobile layout.

## How the data is interpreted

The sheet has three tabs:

- **Groups** — `ID | Classification | Group Name | Bond Lvl | Member Ideologies`
  (members are comma-separated in one cell).
- **Rivalries** — `ID | Level | Side A | Side B`, where each side names a *group*.
- **Details** — free prose, rendered on the Notes tab.

From that:

- **Bond** between two ideologies = the **highest** bond level of any group they share.
  Levels are `1 Shared Sympathy`, `2 Strategic Alignment`, `3 Ideological Coalition`,
  `4 Natural Partners`.
- **Rivalry** = the highest level of any rivalry line connecting a group one is in to a
  group the other is in. Levels are `1 Antagonism`, `2 Existential Threat`.
- A pair can be **both** a bond and a rivalry. Those go in **Frenemies**, and are excluded
  from Bonds and Rivalries so the three sections never overlap.
- An ideology is never made a rival of itself, even if it sits in groups on both sides.

The header row is located by scanning the first rows for the best column-name match, so a
title or note above the header doesn't shift the columns. The sheet is fetched with
`headers=1` — gviz's own header handling — rather than treating row 0 as data: with
`headers=0` gviz types every column from its data rows and blanks out any cell that
doesn't match that type, so a text label sitting above a column of numbers (like
"Bond Lvl") comes back empty and can never be matched by name. If the level column still
can't be found by name, it's inferred from its contents (the column that's almost all
small standalone integers) as a last resort, and a banner on Notes says so. If a level
still can't be read it defaults to 1 **and says so** in a banner on the Notes tab, naming
the group and the raw cell value it saw — a silent default here is what makes every group
look like level 1.

### Groups are matched by ID

Group references resolve on the `G##` id, never on the name — the sheet uses different
names for the same group in different places (`G06` is *Utopian Reformists* in **Groups**
but *Reformist Left* in **Rivalries**). Every extra name found for an id is kept and shown
as an **aka** alias next to the canonical name (the one in the **Groups** tab), and
searching matches aliases too. Repeated ids inside the **Groups** tab are merged the same
way: members are unioned, the highest bond level wins, the extra name becomes an alias.

Column positions are found from the header row, so re-ordering columns is safe. A rivalry
line pointing at an id that doesn't exist in **Groups** is skipped and reported on the
Notes tab rather than silently dropped.

## Requirements for the sheet

1. Shared as **Anyone with the link → Viewer**.
2. Tabs named `Groups`, `Rivalries`, `Details` (change `CONFIG.tabs` in
   `assets/app.js` if you rename them).

If the live sheet can't be reached, the page falls back to `data/snapshot.json` — a
bundled copy of the data — and shows a banner saying so. Results are cached in
`localStorage` for 10 minutes; the ⟳ button forces a fresh read.

## Running / deploying

It's plain HTML/CSS/JS with no dependencies and no build step.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

For GitHub Pages: **Settings → Pages → Deploy from a branch**, pick this branch and the
`/` root folder.

## Ideology icons

Every ideology gets its game icon next to its name — sidebar, cards, group members,
matrix rows. `assets/ideology_leader/` holds the source textures (Victoria 3's own
`ideology_leader_*.dds` files, a game-engine format browsers can't render); those were
converted once to 96×96 PNGs in `assets/icons/`, which is what the site actually loads.

`ICON_OVERRIDES` in `assets/app.js` maps sheet ideology names to icon filenames. Most
resolve automatically (`Anarchist` → `ideology_leader_anarchist.png`); a handful needed an
explicit entry because the game's own filename doesn't match the sheet name 1:1 — a typo
in the source (`idealogy_leader_modernizer`), a different word (`Humanitarian` ships as
`humanitarism`), an ideology added late without its own icon (`Carlist II` reuses
`Carlist`), or no confirmed match at all (`Shojoi` falls back to `isolationist` — flagged
in the code as a guess, not a citation). An ideology with no matching file at all just
loses its icon and falls back to text-only; nothing breaks.

To add or fix an icon: drop the `.dds` in `assets/ideology_leader/`, convert it —

```sh
python3 -c "from PIL import Image; Image.open('assets/ideology_leader/NAME.dds').convert('RGBA').resize((96,96)).save('assets/icons/NAME.png', optimize=True)"
```

— and add an `ICON_OVERRIDES` entry if the filename doesn't already match the sheet name.

## Files

```
index.html                 markup + shell
assets/styles.css          theming, layout, responsive rules
assets/app.js              fetch → CSV parse → normalise → render
assets/icons/              ideology icons (web-ready PNGs)
assets/ideology_leader/    source .dds textures for the icons above
data/snapshot.json         offline fallback copy of the sheet
```

To point the page at a different spreadsheet, change `CONFIG.sheetId` at the top of
`assets/app.js`.
