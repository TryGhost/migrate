# Migrate

A collection of tools for migrating to Ghost.

Each tool has its own detailed documentation:

- [Ghost](https://github.com/TryGhost/migrate/tree/main/packages/mg-ghost-api)
- [beehiiv](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv)
- [beehiiv API](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv-api)
- [beehiiv API Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv-api-members)
- [beehiiv Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv-members)
- [Blogger](https://github.com/TryGhost/migrate/tree/main/packages/mg-blogger)
- [Buttondown](https://github.com/TryGhost/migrate/tree/main/packages/mg-buttondown)
- [Chorus](https://github.com/TryGhost/migrate/tree/main/packages/mg-chorus)
- [Curated](https://github.com/TryGhost/migrate/tree/main/packages/mg-curated-export)
- [Curated members](https://github.com/TryGhost/migrate/tree/main/packages/mg-curated-members-csv)
- [Jekyll](https://github.com/TryGhost/migrate/tree/main/packages/mg-jekyll-export)
- [Letterdrop](https://github.com/TryGhost/migrate/tree/main/packages/mg-letterdrop)
- [Libsyn](https://github.com/TryGhost/migrate/tree/main/packages/mg-libsyn)
- [Mailchimp Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-mailchimp-members)
- [Medium Content](https://github.com/TryGhost/migrate/tree/main/packages/mg-medium-export)
- [Medium Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-medium-members)
- [Squarespace](https://github.com/TryGhost/migrate/tree/main/packages/mg-squarespace-xml)
- [Stripe](https://github.com/TryGhost/migrate/tree/main/packages/mg-stripe)
- [Substack](https://github.com/TryGhost/migrate/tree/main/packages/mg-substack)
- [Substack members](https://github.com/TryGhost/migrate/tree/main/packages/mg-substack-members-csv)
- [Tiny News](https://github.com/TryGhost/migrate/tree/main/packages/mg-tinynews)
- [Tiny News Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-tinynews-members)
- [Wix CSV](https://github.com/TryGhost/migrate/tree/main/packages/mg-wix-csv)
- [WordPress API](https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-api)
- [WordPress XML](https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-xml)


## Install

Migrate is a set of command line tools, install them globally:

`npm install --global @tryghost/migrate`


## Usage

Run `migrate --help` to see a list of available commands.

Basic usage is `migrate [source] source-info`:

E.g.

`migrate medium --pathToZip /path/to/export.zip`

`migrate wp-api --url https://mywpsite.com`

Each source comes with optional flags to customise the migration:

`migrate [source] --help` will give more detail


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

1. `git clone` this repo & `cd` into it as usual
2. `pnpm install` to install all dependencies


## Run

To make sure the TypeScript packages are built (immediately and after file changes), use

```sh
pnpm build:watch
```

Or run `pnpm build` once if you don't need the watching.

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev [source]
```


## Test

- `pnpm lint` runs oxlint and checks formatting with oxfmt
- `pnpm format` reformats all files with oxfmt
- `pnpm test` runs lint and tests


## Dependency management

[Knip](https://knip.dev/) is used to find unused dependencies, exports, and files across the monorepo. Run it with:

```sh
pnpm knip
```

Some dependencies are intentionally kept despite not being directly imported (e.g. optional peer dependencies like `sharp`). These are listed in `knip.json` under `ignoreDependencies` for the relevant workspace.


## Publish

Packages are published to npm automatically via GitHub Actions using OIDC trusted publishers — no npm token is needed.

### Automatic releases

The [Release and Publish workflow](.github/workflows/publish.yml) runs every Monday at **15:00 UTC** (15:00 UK winter time / 16:00 UK summer time), and can also be started from the [Actions tab](https://github.com/TryGhost/migrate/actions/workflows/publish.yml). It only runs in `TryGhost/migrate` on `main`.

1. Check commits since the nearest stable `@tryghost/migrate@x.y.z` tag reachable from `main`. Prerelease tags and tags on unmerged branches are ignored. If there are no new commits, skip the release unless `force` is enabled.
2. Choose a **patch** bump when every commit author contains `renovate` (case-insensitive), or a **minor** bump when there are any other authors. A forced release with no new commits defaults to patch. This matches ghst's author-based policy; it does not inspect Conventional Commit prefixes or infer breaking changes.
3. Run `nx release version` with that bump for **all packages**. Packages keep their independent version numbers, and Nx updates workspace dependencies and the lockfile as needed. The pre-version command in `nx.json` runs the build, lint, formatting checks, release-planning tests, and package tests before changing any versions.
4. Create the `Published new versions [skip ci]` commit and package tags, check npm OIDC authentication, and push the commit and tags together. If `main` has moved or branch rules reject the push, publishing stops.
5. Pack with pnpm to resolve `workspace:*` and catalog references, then publish the packages to npm with provenance and the `latest` dist-tag. Versions already on npm are skipped.

The publishing step runs in the same workflow because pushes made with `GITHUB_TOKEN` do not trigger the usual Test → Publish chain. The release commit also includes `[skip ci]` to avoid a duplicate chain when a separate release token is used. Release/publish jobs are serialized and an in-progress release is not cancelled by a newer run.

The workflow file remains `publish.yml` so existing npm trusted-publisher registrations keep working.

#### GitHub setup

The repository's [Ghost default branch ruleset](https://github.com/TryGhost/migrate/rules/18914630) requires a pull request and the `Required checks pass` status. Automated releases need an identity that can push the already-validated version commit directly:

1. Use an automation identity allowed to **always bypass** that ruleset (a pull-request-only bypass is insufficient).
2. Add a repository Actions secret named `RELEASE_TOKEN` containing a token for that identity with **Contents: read and write** access to this repository. Do not put the token in the workflow file. The workflow supplies `RELEASE_TOKEN` only to the release push step through an environment variable. Checkout does not persist credentials, and the push reads its authentication header from the environment without saving it in Git configuration or including it in command-line arguments. This reduces credential exposure during installation, builds, and tests; steps still share the same runner and are not security-isolated. npm publishing continues using OIDC.
3. If the default GitHub Actions identity already has the necessary bypass, omit `RELEASE_TOKEN`; the workflow falls back to `GITHUB_TOKEN` with `contents: write`. That permission alone does not bypass branch rules.

No branch rules or secrets are changed by this code. A release whose push is rejected stops before publishing anything to npm.

### Manual runs and recovery

Choose a mode when using **Run workflow** on `main`:

| Mode | Behaviour |
| --- | --- |
| `release` (default) | Run the automatic release process now. Use `bump` to choose `auto`, `patch`, or `minor`; use `force` to release even without new commits. Always publishes to `latest`. |
| `oidc-check` | Build and verify npm trusted publishing without versioning or publishing. |
| `dry-run` | Build and preview publishing the existing package versions, without bumping, committing, tagging, pushing, or publishing. Also checks OIDC. |
| `publish` | Build, validate, and publish existing package versions without another version bump. Use this to finish a partially failed release. |

`npm_tag` applies to `publish` and `dry-run` modes. `bump` and `force` only apply to `release` mode. The dry-run previews existing versions, not a future automatic version bump.

The release commit is pushed **before** npm publication. If npm fails partway through, run `publish` to retry the recorded versions; it skips packages that succeeded. Do not force a new release just to retry publishing.

### Releasing locally

`pnpm ship` still works for interactive releases, including major bumps and custom versions:

1. Run `pnpm ship` locally to version, tag, and push. Nx prompts per package and updates dependent packages.
2. The push to `main` runs the Test workflow. When it succeeds on the `Published new versions` commit, the publish workflow checks out that exact tested commit and publishes its unpublished versions.

### Releasing a single package

To version one package instead of the whole monorepo, pass `--projects`:

```sh
pnpm ship --projects=@tryghost/mg-context
```

You are prompted for the bump level — major, minor, patch, or a custom exact version — for that package alone. Anything depending on it is then bumped a patch automatically, so the published dependents point at the new version rather than the old one. Releasing `mg-context`, for example, also releases `mg-ghost-api`, `mg-queue` and `migrate`.

The prompt starts on `major`, so arrow down to the bump you want rather than pressing enter.

Preview the whole thing first with `--dry-run`, which writes and pushes nothing:

```sh
pnpm ship --projects=@tryghost/mg-context --dry-run
```

The publish workflow skips any version already on npm, so only the packages bumped here are published.

### First release of a new package

When publishing a package for the first time:

1. Create the package in `packages/` (see CLAUDE.md for the template)
2. Set `"version": "0.0.0"` in its `package.json`
3. Commit and merge to `main`
4. From the repo root, version, tag, and push just the new package:
    ```sh
    pnpm ship:first-release --projects=@tryghost/mg-<name>
    ```
5. Manually publish the package to npm (CI can only update packages that already exist on npm):
    ```sh
    cd packages/mg-<name>
    pnpm build && npm publish --access public

    # If the package has a prerelease tag, add --tag pre
    pnpm build && npm publish --access public --tag pre
    ```
6. Register the package as a trusted publisher so CI can handle future releases:
    ```sh
    npm trust github <package-name> --repo TryGhost/migrate --file publish.yml --allow-publish --yes

    # Example:
    npm trust github @tryghost/mg-example-package --repo TryGhost/migrate --file publish.yml --allow-publish --yes
    ```


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
