# Remove Calendar Airmail

## Context

GitHub push protection blocks the first push of `main` because the inherited
Calendar Airmail plugin contains a Google desktop OAuth client ID and client
secret. ZuoChong does not need this plugin.

## Decision

Remove `plugins/official/openpets.calendar-airmail/` from the current product
and from the unpublished history that will be pushed to ZuoChong. Keep the
upstream `origin` remote and its remote-tracking refs unchanged.

## Current-Tree Changes

- Delete the complete Calendar Airmail plugin package and its assets/locales.
- Remove Calendar Airmail from official-plugin inventory and conceptual docs.
- Remove the courier-sprite fixture test that depends exclusively on this
  plugin; keep the shared sprite validator used by release validation.
- Update codemaps or validation guidance that lists Calendar Airmail.

## History and Push

Rewrite only local publish branches so the removed plugin path is absent from
every reachable commit. Do not rewrite or push upstream tags or `origin/*`
refs. Verify that `main` contains neither the plugin path nor the blocked
credential patterns, then push only `main` to the `zuochong` remote.

## Validation

Run plugin tests first, then the repository-wide `pnpm check`. Confirm the
rewritten history passes `git fsck`, a local empty-repository push, and a
path-history scan before retrying GitHub. Keep `.npmrc` untracked.
