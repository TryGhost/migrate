# Migrate Substack CSV Export

## Install

`npm install @tryghost/mg-substack-csv --save`

or

`yarn add @tryghost/mg-substack-csv`


## Usage

Substack provides an overview `csv` file as well as a folder containing different files for each post.

To run an absolute basic Substack migration, the required command is this:

`yarn migrate substack <path to post.csv file>`

It's possible to pass more options, in order to achieve a better migration file for Ghost:

`--url <URL>`
Provide a URL to the Substack instance, so we can try and scrape additional information for each post

`--readPosts <path to directory containing html files>`
Some Substack exports include a directory with `html` files for each post.

`--email <email of main author>`
Provide an email for users e.g. john@mycompany.com to create a general user w/ slug `john` and provided email

`--drafts true`
You can decide to not import drafts, when the post was e. g. only used to generate a newsletter but never published as a post. In this case the newsletter would be classed as `draft` and you can decide to not import them by setting this flag to false

<hr>

A more realistic command for a Substack migration looks like this:

`yarn migrate substack <path to post.csv file> --url <URL to substack instance> --readPosts <path to directory containing html files> --email <main author email> --drafts false`

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
