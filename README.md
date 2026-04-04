# Migrate

A collection of tools for migrating to Ghost.

Each tool has its own detailed documentation:

- [Ghost](https://github.com/TryGhost/migrate/tree/main/packages/mg-ghost-api)
- [beehiiv](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv)
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

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests


## Publish

Packages are published to npm automatically via GitHub Actions using OIDC trusted publishers — no npm token is needed.

### How to release

1. Run `pnpm ship` locally to interactively version bump, tag, and push to git
    - Uses `nx release` under the hood — prompts per-package for the bump level
    - Also updates any packages which depend on changed packages
2. The push to `main` triggers the [publish workflow](.github/workflows/publish.yml), which builds and publishes all bumped packages to npm

You can also trigger a dry-run from the [Actions tab](https://github.com/TryGhost/migrate/actions/workflows/publish.yml) to preview what would be published without actually publishing.

### First release of a new package

When publishing a package for the first time:

1. Create the package in `packages/` (see CLAUDE.md for the template)
2. Set `"version": "0.0.0"` in its `package.json`
3. Commit and merge to `main`
4. Register the package as a trusted publisher:
    ```sh
    npm trust github <package-name> --repo TryGhost/migrate --file publish.yml --yes

    # Example:
    npm trust github @tryghost/mg-example-package --repo TryGhost/migrate --file publish.yml --yes
    ```
5. Run `pnpm ship:first-release` — select the initial version when prompted


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
