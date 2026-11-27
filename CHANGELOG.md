# Changelog

## [Unreleased]

### Fixed

- Settle marks the settled thread and its settled children read, so a finished thread you never opened stops showing as unread. Undo makes them unread again unless bb recorded a new read since.

### Added

- A "BB compat" workflow that runs the type check and scratch smoke test daily against the latest stable BB and reports a failure in a `bb-compat` issue.

### Changed

- The e2e seeds tolerate any provider notification that BB does not map (`provider/unhandled`), so a newer Codex CLI cannot fail them. Agent output and provider errors still fail them.
- CI installs the latest Codex CLI for the Browser e2e and BB compat runs instead of a pinned version. The e2e error text and `e2e/README.md` no longer name a version.
- Added the live BB Marketplace badge and installation command, and updated the listing documentation.

### Removed

- The inherited `scripts/bb-compat` tooling and its never-run `bb compatibility` and `bb bump` workflows. The shared "BB compat" workflow from `ysskrishna/bb-plugin-ci` replaces them.

## [0.1.1]

### Changed

- Standardized the package, plugin ID, routes, browser storage, and marketplace entry on `bb-thread-inbox`.
- Renamed the CLI to `bb thread-inbox` and removed the obsolete runtime names.
- Cleaned generated bundles before builds so retired entry points are not carried into packages.
- Updated installation and marketplace instructions for the first marketplace release.

## [0.1.0]

Initial release of Thread Inbox for BB.

- Working, Active, and Settled sections with live status and recent-return ordering.
- Always-visible Search threads control that opens BB's native search, including settled conversations.
- Settle, Un-settle, Undo, Snooze, and Wake with keyboard and touch support.
- Automatic settling for inactivity and merged or closed pull requests, with busy, queue, question, pin, and child protections.
- Light and dark themes, aligned settings, project filtering, and optional compact cards.
- Existing filing data and saved project appearance are preserved.
- Tag-based GitHub Releases, security reporting, and installation documentation.
