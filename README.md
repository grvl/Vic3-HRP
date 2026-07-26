# Victoria 3 — Ideology Affinity Groups

A static, no-build visualizer for the Victoria 3 character-ideology affinity sheet.
Pick an ideology and see every bond and rivalry it inherits from the groups it belongs to.

**The spreadsheet is the source of truth.** The page reads it on every load, so editing
the sheet updates the site — no commit, no deploy.

## Views

| View | What it shows |
| --- | --- |
| **Ideologies** | Pick one → its groups, all bonds (strongest first) and all rivalries, each annotated with the group or rivalry line it came from. Cards are clickable, so you can walk the graph. |
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
- **Rivalry** between two ideologies = the highest level of any rivalry line connecting a
  group one is in to a group the other is in.
- A pair can be **both** a bond and a rivalry; those cards are flagged.
- An ideology is never made a rival of itself, even if it sits in groups on both sides.

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

## Files

```
index.html            markup + shell
assets/styles.css     theming, layout, responsive rules
assets/app.js         fetch → CSV parse → normalise → render
data/snapshot.json    offline fallback copy of the sheet
```

To point the page at a different spreadsheet, change `CONFIG.sheetId` at the top of
`assets/app.js`.
