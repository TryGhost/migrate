# Migrate Revue Api

## Install

`npm install @tryghost/mg-revue-api --save`

or

`yarn add @tryghost/mg-revue-api`


## Usage

Revue has and API that we can use to fetch content for migration. The token can be found on the [integrations page](https://www.getrevue.co/app/integrations) when logged in.

To run a basic migration from Revue all you need is to run a command like this:

`migrate revue <pubName> <API token>`

The `pubName` value is the publication or user name. It's the last part of the profile URL, e. g. https://www.getrevue.co/profile/**<pubName>**

It's possible to pass more options, in order to achieve a better migration file for Ghost:

`--addPrimaryTag <tag>`
Provide a tag slug or name which should be added to every post as primary tag.

`--email <email of main author>`
Provide an email or the author of the publication.

`--fallBackHTMLCard false`
Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

<hr>

A more realistic command for a Substack migration looks like this:

`migrate revue <URL> <API token> --email <test@example.com>`


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests




# Copyright & License

Copyright (c) 2013-2021 Ghost Foundation - Released under the [MIT license](LICENSE).
