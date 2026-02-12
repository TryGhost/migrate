# Migrate Ghost Authors

Fetch existing Ghost users and merge with migrated authors to prevent duplicate author creation during migrations.


## Install

To use this package in your own project:

`npm install @tryghost/mg-ghost-authors --save`

or

`yarn add @tryghost/mg-ghost-authors`


## Usage

This package provides utilities to fetch existing users from a Ghost instance and merge them with authors from a migration source. When a match is found by email address, the Ghost user's ID is used so content is attributed to the existing author rather than creating a duplicate.

### Basic Usage

```js
import {fetchGhostUsers, mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';

// Fetch existing users from Ghost
const ghostUsers = await fetchGhostUsers({
    apiUrl: 'https://example.ghost.io',
    adminKey: 'your-admin-api-key'
});

// Merge with migrated users
const mergedUsers = mergeUsersWithGhost(sourceUsers, ghostUsers);
```

### CLI Options

When integrating into a migration source, this package exports CLI option definitions:

```js
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Spread into your command's options
const options = [
    ...otherOptions,
    ...ghostAuthOptions
];
```

This adds the following CLI options:

- **`--ghostApiUrl`**
    - Ghost site URL to fetch existing users (e.g. `https://example.ghost.io`)
    - string - default: `null`
- **`--ghostAdminKey`**
    - Ghost Admin API key to authenticate with Ghost (format: `id:secret`)
    - string - default: `null`

### Task Integration

For use with the listr task runner:

```js
import {createGhostUserTasks} from '@tryghost/mg-ghost-authors';

const tasks = [
    // ... other tasks
    ...createGhostUserTasks(options)
];
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
