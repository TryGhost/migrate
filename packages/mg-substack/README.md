# Migrate Substack `zip` Export

Converts a Substack `zip` export and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-substack --save`

or

`yarn add @tryghost/mg-substack`


## Usage

To run an absolute basic Substack migration, the required command is this:

```sh
migrate substack <pathToZip>
```

A more realistic command for a Substack migration looks like this:

```sh
migrate substack <pathToZip> --url <susbtackURL>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`        
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`            
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `none`    
- **`--size_limit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize     
- **`-e` `--email`** 
    - Provide an email domain for users e.g. `person@example.com` (Is ignored if `--useMetaAuthor` is provided)
    - bool/string - default: `false`            
- **`-u` `--url`** 
    - Provide a URL (without trailing slash) to the hosted source site, so we can scrape data e.g. `https://example.substack.com`
    - string - default:`https://ghost.io`          
- **`--drafts`** 
    - Import draft posts
    - bool - default: `true`       
- **`--threads`** 
    - Import thread posts
    - bool - default: `false`       
- **`--subscribeLink`** 
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--commentLink`** 
    - Provide a path that existing `/comments` anchors will link to e.g. `#ghost-comments-root` (`#` characters need to be escaped with a `\`)
    - string - default: `#ghost-comments-root`
- **`--useMetaImage`** 
    - Use `og:image` value as the feature image
    - bool - default: `true`  
- **`--useMetaAuthor`** 
    - Use the author field from `ld+json` (useful for posts with multiple authors)
    - bool - default: `true`  
- **`--postsBefore`** 
    - Only migrate posts before and including a given date e.g. 'March 20 2018'
    - string - default: `null`
- **`--postsAfter`** 
    - Only migrate posts after and including a given date e.g. 'August 16 2022'
    - string - default: `null`
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `false`      

**Note**: You can combine `--postsBefore` and `--postsAfter` to migrate posts between 2 dates.


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev substack <pathToZip>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
