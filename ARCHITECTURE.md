# ScriptMaker Architecture

ScriptMaker is split into three entry points for long-term development.

```text
ScriptMaker/
  Editor/   Editing PWA entry point
  Viewer/   Read-only PWA entry point
  Share/    Share management entry point
```

## Editor

`Editor/` is the editing app. It reuses the existing production editor code in `css/styles.css` and `js/app.js` so existing behavior and localStorage data remain compatible.

The legacy root `index.html` is also kept for backward compatibility.

Primary storage key:

```text
script_assistant_data_v21
```

## Viewer

`Viewer/` is a read-only PWA for performers and readers. It renders a copied project payload and does not write back to the editor data.

Supported data sources:

- `Viewer/index.html#data=<base64url-json>` from Share
- `Viewer/index.html?share=<shareId>` for same-origin local share lookup

Viewer renders:

- talks
- scene descriptions
- character icons
- protagonist alignment
- single wallpaper
- scene wallpaper settings with fade transitions

Viewer intentionally excludes editing, deletion, AI, sorting, and settings UI.

## Share

`Share/` reads Editor projects from `script_assistant_data_v21` and stores share snapshots in:

```text
scriptmaker_shares_v1
```

A share contains a copied project snapshot plus metadata and future-ready options:

- `isPublic`
- `expiresAt`
- `passwordEnabled`

Share can create, update, delete, copy, and open Viewer URLs.

## Data Flow

```text
Editor localStorage project
        |
        v
Share creates snapshot + Viewer URL
        |
        v
Viewer loads snapshot as read-only data
```

Editor remains the only editing source. Viewer data is immutable from the UI.

## GitHub Pages

Publish from the repository root.

Useful entry points:

- `/` existing Editor-compatible entry
- `/Editor/` editing app
- `/Viewer/` read-only app
- `/Share/` share management

## Future Extension Points

The split keeps future features scoped:

- collaborative editing: Editor data layer
- comments: Share/Viewer payload metadata
- read-complete checks: Viewer-side optional user state
- acting notes: Viewer annotations or Share permissions
- audio playback: Viewer timeline extensions
- recording management: Share metadata and project exports
