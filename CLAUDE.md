# Repo instructions

## Attribution

Do NOT credit Claude anywhere. No `Co-Authored-By: Claude` trailers, no
"Generated with Claude Code" lines, no similar attribution in commit messages,
PR titles/bodies, or code comments.

## Verification

Treat the files in `registry/` as source and the matching files in `public/r/` as
committed build artifacts. A component change is not complete until its generated
registry item is refreshed. Changes to a vanilla component used by a standalone demo
must also refresh the matching bundle in `public/demo/`.

After changing component source or `registry.json`, run:

```bash
npm run registry:build
npm run demo:build
git diff --check
```

Keep every generated change that corresponds to the source change. Do not restore,
hand-edit, or omit generated files to make the diff smaller. Do not overwrite or discard
unrelated changes in an already-dirty worktree.

`npm run verify:generated` is the clean-checkout/CI release gate. It rebuilds both output
trees and fails if `public/r` or `public/demo` differs from the checked-in commit,
including untracked generated files. Because intended generated changes are necessarily
dirty before they are committed, this command is expected to fail in that situation;
use the build commands above for local iteration. CI must pass `verify:generated` before
publishing Pages.

### React registry changes

For React or shadcn-native changes, do not treat a successful `shadcn build` as a type or
consumer compatibility test. Verify the built item through the same installation path a
consumer uses:

1. Install the relevant `public/r/<name>.json` into a disposable initialized shadcn
   project outside the repository.
2. TypeScript-compile the installed output.
3. Confirm hook-using entry points retain a top-level `'use client'` directive after
   installation.
4. Exercise the changed behavior with a focused runtime check, especially for engines,
   timers, dynamic arrays, cleanup, and invalid inputs.

Test both the framework-agnostic and shadcn-native implementations when behavior is
duplicated between them. Use stable IDs in Steps tests that insert, remove, or reorder the
array, and verify that active, reached, reset, and error state remains attached to the
same logical steps.

React Doctor currently does not detect this registry as a React project. Its reported
100/100 score is not evidence of a clean React scan when it also says React rules were
gated off. Record that limitation and rely on consumer compilation and focused checks.

### Before handing off

Report exactly which checks ran and whether they passed. If a check could not run, or is
expected to fail because the worktree contains intentional uncommitted artifacts, say so
explicitly instead of describing the change as fully verified.
