# Docflow

An offline desktop app that converts PDFs — text-based or scanned — into clean,
editable markdown, with first-class support for Persian and other right-to-left
scripts.

> **Status: in development.** This README is a stub; full setup instructions,
> screenshots, and a write-up of the RTL handling approach land once the app is
> feature-complete.

## Why

Most PDF-to-markdown tools quietly mangle Persian text. The two failure modes
are always the same: letters that don't join correctly, and words that come out
in reverse reading order. Docflow treats that as the core problem rather than an
afterthought — see the RTL section of this README (coming) for how it's handled.

## Tech stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Shell      | Electron (TypeScript main process)                   |
| Frontend   | React + TypeScript, bundled with electron-vite       |
| State      | Zustand                                              |
| Editor     | Milkdown (ProseMirror)                               |
| Styling    | Tailwind CSS v4 + shadcn/ui                          |
| PDF / OCR  | Python sidecar (PyMuPDF, Tesseract), bundled binary  |
| Packaging  | electron-builder                                     |

## Development

Requires Node.js 22+ and Python 3.11+.

```bash
npm install     # also downloads the Electron binary via `install-electron`
npm run dev     # launch with hot reload
npm run build   # typecheck + build all three bundles
```

## License

MIT — see [LICENSE](LICENSE).
