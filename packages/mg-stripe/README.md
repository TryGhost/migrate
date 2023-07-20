# Migrate Stripe

Migrate Stripe products, prices, coupons, subscriptions and invoices from an old to a new Stripe account.

## Install

Install the migrate CLI `@tryghost/migrate` as a global package:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-stripe --save`

or

`yarn add @tryghost/mg-stripe`


## Usage

### Pre-requisites

Before proceeding, be sure to have:
1. Disabled new subscriptions on the old site
2. Copied all Stripe customers, using the Stripe dashboard ([docs](https://stripe.com/docs/payments/account/data-migrations/pan-copy-self-serve))

### Copy

The `copy` command makes a copy of products, prices, coupons, invoices and subscriptions from the old to the new Stripe account. It will also pause existing subscriptions in the old Stripe account.

```sh
migrate stripe copy
```

We recommend running a dry run first, with the option `--dry-run`. The dry run will not create any data in the new Stripe account, nor update any data in the old Stripe account.

```sh
migrate stripe copy --dry-run
```

Some other useful options are:
- `--from`: the Stripe API secret key of the old account (optional)
- `--to`: the Stripe API secret key of the new account (optional)
- `--delay`: Period (in hours, starting now) during which payment collection is paused. This period should be large enough to cover the entire migration. Estimated time to migrate 10,000 members is 1 hour, we recommend adding an extra hour of buffer time to be safe (optional)

See full list of options [here](https://github.com/TryGhost/migrate/blob/main/packages/mg-stripe/src/lib/Options.ts).

### Confirm

The `command` command confirms a previously created copy. It will finalise subscriptions and invoices in the new Stripe account.

```sh
migrate stripe confirm
```

### Revert

The `revert` command reverts the copy. It will delete any data created in the new Stripe account and resume subscriptions in the old Stripe account.

```sh
migrate stripe revert
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).
Follow the instructions for the top-level repo.

### Install

1. `cd` to the top of the monorepo
2. Run `yarn` to install dependencies.


### Run

1. `cd` to the top of the monorepo
2. Run `yarn dev stripe <command>` to run the copy, confirm or revert command


### Test

- `yarn lint` to run linting
- `yarn test` to run test and linting


## Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
