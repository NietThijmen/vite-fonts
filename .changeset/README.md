# Changesets

This folder holds changeset files for [Changesets](https://github.com/changesets/changesets). Each pull request that should ship a release adds one with `pnpm changeset`. CI comments on the pull request when a changeset is missing, and after merge it opens a version pull request that bumps the package version and changelog.
