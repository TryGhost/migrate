# Migrate Squarespace Xml

## Install

`npm install @tryghost/mg-squarespace-xml --save`

or

`yarn add @tryghost/mg-squarespace-xml`


## Usage

Squarespace has a migration path via WordPress which results in a `xml` with all content.

To run an absolute basic Squarespace migration, the required command is this:

`migrate squarespace <path to xml file>`

It's possible to pass more options, in order to achieve a better migration file for Ghost:

`--drafts true`
You can decide to not import drafts, when the post was e. g. only used to generate a newsletter but never published as a post. In this case the newsletter would be classed as `draft` and you can decide to not import them by setting this flag to false

`--pages false`
Squarespace, as a website builder, can contain more than just posts. By default, we're not importing pages. This flag can be set to `true` to change this setting.

`--tags true`
Similar to WordPress, we have tags and categories. If you only want to import categories, set `tags` to `false`

`--addTag <tag name>`
Provide an optional tag name that should be added to each migrated post/page. This will be **in addition** to the automatically generated internal tag `#sqs`.

`--fallBackHTMLCard false`
Fall back to convert to HTMLCard, if standard Mobiledoc convert fails


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

Copyright (c) 2020 Ghost Foundation - Released under the [MIT license](LICENSE).