# Comments

Point at a part of a running Data App, say what is wrong with it, and hand that to an agent as a
prompt it can act on. This spec comes before the code. When the two disagree, fix one of them on
purpose.

Status: **built**.

---

## 1. Principles

- **Read-only.** Commenting never executes a query, sets a control or changes a selection. The only
  things it does to the page are pick and highlight, which change no state.
- **Marked nodes only.** What can be commented on is what the inspector's Structure shows: the
  elements the markup marks with `data-anfra-container`, `data-anfra-block`, `data-anfra-query` or
  `data-anfra-control`. Their handles are what an agent searches the definition for.
- **Host-side.** It runs in the host page, not in the Data App's frame. It uses the SDK's pick and
  highlight, and the host's own injected frame script for positions (§5.3). It never patches SDK
  methods or reads the frame's globals.
- **One comment, one prompt.** A comment is written, copied (or sent), and gone. Nothing is kept.
- **Says why.** A disabled thing always says why ("Disabled by admin", "Write a comment first").

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **Comment mode** | The frame is in pick mode on behalf of Comments, not the inspector. |
| **Node** | One marked element of the structure (`StructureNode`), addressed by its `key` (`0.2.1`). |
| **Handle** | A node's identity for an agent, from the inspector's `handleFor`: `[Label](data-anfra-block="id")`, or the attribute alone. |
| **Card** | The floating comment box, anchored next to the commented node in the stage. |
| **Prompt** | The Markdown text the card copies or sends: the app, the node, where it sits, and the comment (§4.4). |
| **Target** | Where Send hands the prompt: Claude, ChatGPT or Cursor. All disabled in this demo. |

## 3. Layout and entry points

**Host toolbar**: an **Ask AI** button (`MessageCircle` icon, text "Ask AI"), left of Prompt (then
Inspect). It toggles comment mode and shows as pressed while picking or while a card is open.
- Tooltip: "Comment on an element" (or "Stop commenting" while on), with the shortcut.
- Shortcut: **Alt+Shift+C**, on the page or forwarded from the frame like Alt+Shift+P and
  Alt+Shift+I.
- **Command palette**: "Comment on an element".
- Disabled, like Inspect, when no app is open.

Comment mode does not need the inspect panel. It works with the panel open or closed, and it
doesn't open it.

**One pick mode.** The frame has one pick mode, shared with the inspector's Pick. Entering comment
mode ends an inspector pick, and the inspector's Pick ends comment mode (and closes an open card).

**Reset.** Reload, a path change or a live reload closes the card and leaves comment mode, like the
inspector's own reset.

## 4. Behavior

### 4.1 Flow

1. **Activate** (button, shortcut or palette). The frame enters pick mode: pointing outlines marked
   elements (the SDK's pick), and the pointer becomes the comment cursor, an arrow with a speech
   bubble, so the mode can't be mistaken for the inspector's Pick. It goes back once picking ends.
2. **Pick.** A click picks the node under the pointer. The frame leaves pick mode. The node is held
   highlighted (`highlight(key)`) and the card opens next to it. If the structure snapshot has not
   arrived yet, the host waits briefly for it; if the node never appears, it toasts and gives up.
   While the card is open the comment owns the outline: the inspector Structure tree's hover and
   clear do not steal it.
3. **Write.** The textarea has focus. The node stays highlighted for as long as the card is open,
   and the card follows the node when the frame scrolls or resizes.
4. **Copy** (or Cmd/Ctrl+Enter). The prompt (§4.4) goes to the clipboard. The Copy button's
   tooltip says "Copied", or "Couldn't copy: logged to the console" if the clipboard refuses, in
   which case the prompt is logged. The card stays open for a moment so the confirmation is seen,
   then closes.
5. **Close.** Closing the card clears the highlight and leaves comment mode.

**Cancelling**
- Escape in the frame while picking leaves pick mode (the SDK's own); nothing opens.
- Pressing Comment again while picking cancels.
- Escape in the card, or its ×, discards the card.
- Pressing Comment while a card is open closes the card.
- Clicking outside the card (in the frame or the host) does **not** close it, so a half-written
  comment isn't lost to a stray click.

A new pick while a card is open isn't possible: the card is open only outside pick mode. To comment
on another node, close the card and press Comment again.

### 4.2 Card

A shadcn Popover, non-modal, anchored to the node's rect in the stage. It places itself beside the
node and flips or shifts to stay inside the stage. Its width is 320px, or less in a narrow stage.

```
┌ [block] Revenue by month                 × ┐
│ data-anfra-block="revenue"           (mono) │
│ ┌────────────────────────────────────────┐ │
│ │ What do you want to ask or change?     │ │   textarea, autofocus, grows to ~8 lines
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│                   [Copy]  [Send to Claude│▾] │
└─────────────────────────────────────────────┘
```

- **Header**: the kind pill (the inspector's Structure colors), the node's label (or its id or
  name when it has none), and ×.
- **Handle line**: the attribute as written, in mono, truncated with the full text in a tooltip.
- **Problems**: when the node has markup problems, a ⚠ under the handle with the count; the tooltip
  lists them.
- **Copy**: disabled while the comment is empty or only spaces (tooltip "Write a comment first").
  Disabled buttons use `aria-disabled`, not `disabled`, so they stay focusable and keep their
  tooltips.
- **Send to Claude** is a split button. Both halves are shown so the targets can be seen:
  - The main half is **disabled**, tooltip "Disabled by admin".
  - The ▾ half opens a dropdown of the targets, **Claude · ChatGPT · Cursor**. Each item is
    disabled and reads "Disabled by admin" on its right.
- The comment is plain text. It is not remembered once the card closes.

### 4.3 What the card is anchored to

The SDK's pick reports only the node's key, with no position. The host gets the rect from its own
script in the frame (§5.3): each click reports the closest marked element's attribute and rect, and
while a card is open the frame keeps posting that element's rect on scroll and resize.

- If the click's attribute is the picked node's attribute, the card anchors to that rect.
- Otherwise (a pick that didn't come from a click, or a mismatch) it anchors at the click point, or
  at the top centre of the stage if there was no click.
- If the element leaves the frame's viewport, the card stays clamped to the stage's edge.

### 4.4 Prompt

Markdown, short enough to paste anywhere:

```md
Comment on the Data App "Sales Overview" (apps/sales/overview.html).

Element: block [Revenue by month](data-anfra-block="revenue")
Inside: container [KPIs](data-anfra-container="kpis") › container [Top](data-anfra-container="top")

Markup problems:
- Block "revenue" has no label.

Comment:
The y axis should start at zero.
```

- The title is the app's label; the file is `apps/<path>`, as anfra serves it.
- **Element** is the node's kind and `handleFor` handle.
- **Inside** lists the node's ancestors, outermost first. It is left out for a top-level node.
- **Markup problems** is left out when there are none.
- The comment is trimmed, otherwise as typed.

### 4.5 Keyboard and accessibility

- The toolbar button has `aria-pressed`, an `aria-label` and a tooltip with its shortcut.
- The card is a dialog (`role="dialog"`, labelled by its header); focus moves to the textarea on
  open and back to the toolbar button on close.
- Cmd/Ctrl+Enter copies. Escape closes.
- Disabled controls are wrapped so their tooltips still show on hover and focus.
- Light and dark themes come from the host's tokens; the kind pill has dark variants.

## 5. Structure

### 5.1 Folder

```
src/comments/
  SPEC.md                 this file
  index.ts                the public API; the only file a host imports from
  model/
    prompt.ts             findNode (node + ancestors by key), buildCommentPrompt; pure, no React
  ui/
    comment-card.tsx      the card: header, handle, textarea, Copy, Send split button
```

Rules, as in the inspector:
- `model/` depends on SDK **types** only.
- `ui/` never touches the SDK or the frame. It gets a node, a rect and callbacks.
- Nothing outside `src/comments/` imports from inside it except through `index.ts`.
- It reuses the inspector's `handleFor` and `copyText`, through `@/inspector`'s `index.ts`.
- shadcn primitives: `popover`, `textarea` (new), `button`, `dropdown-menu`, `tooltip`.

### 5.2 The host contract

```ts
/** A node and the nodes it sits in, outermost first; undefined if the key isn't in the structure. */
function findNode(nodes: StructureNode[], key: string):
  { node: StructureNode; ancestors: StructureNode[] } | undefined;

function buildCommentPrompt(input: {
  app: { label: string; file: string };   // file: 'apps/sales/overview.html'
  node: StructureNode;
  ancestors: StructureNode[];
  comment: string;
}): string;

/** A rect in the stage's coordinates (the frame's viewport, as the frame fills the stage). */
interface AnchorRect { x: number; y: number; width: number; height: number }

function CommentCard(props: {
  node: StructureNode;
  rect: AnchorRect;
  prompt(comment: string): string;   // the host builds it, so the card doesn't need the app
  onClose(): void;
}): JSX.Element;
```

The card renders inside the stage's `relative` wrapper, with an invisible `PopoverAnchor` placed at
`rect`. The node's highlight is set from an effect, after the stage's own effects: leaving pick
mode clears the frame's highlight, so a highlight set before it would be lost.

### 5.3 Frame script

The host already appends a script to each definition (`keyForwarder` in `src/data-app.ts`). It
grows two things:
- **Click report**: the existing `anfra-host:click` message (Shift state, for Inspect) also carries
  the click point and, for the closest marked ancestor of the target, its attribute as written and
  its `getBoundingClientRect()`.
- **Cursor**: on `{ type: 'anfra-host:cursor', on }` from the parent, it shows the comment cursor
  over every element (an inline SVG, falling back to a crosshair), or stops.
- **Tracking**: on `{ type: 'anfra-host:track', on: true }` from the parent, the frame keeps the
  element from the last click and posts `{ type: 'anfra-host:rect', rect }` on scroll (capture, so
  inner scrollers count) and resize, at most once per animation frame, until `{ on: false }`.

Messages from the frame are accepted only from the mounted frame's window.

### 5.4 Data flow

```
toolbar / Alt+Shift+C ──▶ App: pickFor = 'comment' ──▶ DataApp.setPicking(true)
frame click ──anfra-host:click {attr, rect, x, y}──▶ App: last click
frame pick ──onPick(key)──▶ App: findNode(snapshot.structure, key)
                              ├─▶ DataApp.highlight(key)
                              ├─▶ frame ◀── anfra-host:track {on:true}
                              └─▶ <CommentCard node rect>
frame scroll/resize ──anfra-host:rect──▶ App: rect ──▶ card re-anchors
card close ──▶ highlight(null), track {on:false}
```

The structure comes from the inspector store's snapshot. The frame posts snapshots only while it is
inspected, so the host keeps `setInspecting(true)` on while in comment mode, even with the panel
closed.

## 6. Out of scope

- Commenting on unmarked elements (a title, an axis, a button inside a block).
- Several comments at once, numbered pins, or a comment list.
- Keeping comments across reloads, or sharing them with other readers.
- Actually sending to a target. Send is disabled in this demo (§8).
- Screenshots of the node in the prompt.

## 7. Porting to another host

1. Copy `src/comments/` (it needs `src/inspector/` for `handleFor` and `copyText`).
2. Add the click report and tracking to the frame script (§5.3).
3. On pick in comment mode: `findNode`, `highlight(key)`, start tracking, render `<CommentCard>`
   over the stage.

## 8. Decisions

- **Marked nodes only**, through the SDK's pick, so a comment's handle is always findable in the
  definition.
- **Floating card**, not a docked panel, so the comment sits beside what it is about.
- **One comment per prompt.**
- **Send is disabled** ("Disabled by admin") in this demo. The targets are listed so the design
  can be seen. Copy is the working path.

## 9. Open questions

1. **How each target receives a prompt**, once enabled: `claude.ai/new?q=` and `chatgpt.com/?q=`
   open a new chat; Cursor has a `cursor://…/prompt?text=` deeplink; Claude Code has no reliable
   way into a running session (copy and paste, or an MCP channel through this host's server).
   URL length limits apply to all of them.
2. **Remember the last target** for the split button's main half?
