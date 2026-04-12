# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Overview

This is a Ghost blog migration toolkit - a monorepo with 45+ packages for migrating content from various platforms to Ghost. Requires **Node >= 22.21.1**.

## Package Manager & Dependencies

- **Always use `pnpm` for all commands.** This repository uses pnpm workspaces with Nx.
- Install dependencies with `pnpm add`, like `pnpm add some-package`. If the dependency is for development, pass the `-D` flag, like `pnpm add -D some-package`. Exact versions are pinned automatically via `.npmrc`.
- **Always pin exact versions.** Use `"1.2.3"`, not `"^1.2.3"` or `"~1.2.3"`.
- **Use `workspace:*`** for dependencies on other packages in this monorepo.

## Common Commands

### Development
```bash
pnpm install                   # Install dependencies
pnpm dev                       # Local dev with tsx
pnpm dev:debug                 # Dev with DEBUG=@tryghost*,migrate:* enabled
```

### Building
```bash
pnpm build                     # Build all TypeScript packages
pnpm build:watch               # Watch mode for TypeScript
```

### Testing
```bash
pnpm test                      # Run tests + lint for all packages
pnpm test:only                 # Run tests only (no lint)

# Single package
cd packages/<name> && pnpm test
```

### Linting
```bash
pnpm lint                      # Lint all packages
```

## Project Structure

```
packages/
├── migrate/              # CLI entry point
├── mg-context/           # Base classes (MigrateBase, MigrateContext)
├── mg-fs-utils/          # File system utilities
├── mg-assetscraper/      # Media asset downloading
├── mg-webscraper/        # Web scraping utilities
├── mg-json/              # Ghost JSON formatting
├── mg-html-mobiledoc/    # HTML → MobileDoc conversion
├── mg-html-lexical/      # HTML → Lexical conversion
├── mg-<source>-*/        # Source adapters (medium, wp, substack, etc.)
└── mg-<source>-members/  # Member import adapters
```

## ESM Import Requirements

**This is a pure ESM codebase.** All packages have `"type": "module"`.

### Critical Rules:
1. **Always include `.js` extensions** in relative imports, even for TypeScript:
   ```javascript
   // Correct
   import {foo} from './lib/utils.js';
   import Bar from '../Bar.js';

   // Wrong - will fail at runtime
   import {foo} from './lib/utils';
   import Bar from '../Bar';
   ```

2. **Use `import`, never `require()`**:
   ```javascript
   // Correct
   import errors from '@tryghost/errors';

   // Wrong
   const errors = require('@tryghost/errors');
   ```

3. **Export patterns**:
   ```javascript
   // Named exports for utilities
   export {toGhostJSON, hydrate};

   // Default export for main functionality
   export default ClassName;
   ```

## TypeScript Setup

TypeScript packages live in `src/` and compile to `build/`.

### Standard tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "build",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Package.json exports for TypeScript:
```json
{
  "type": "module",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "default": "./build/index.js"
    }
  },
  "files": ["build"]
}
```

## Testing Patterns

### Framework
- **All packages** use Node's built-in test runner (`node:test`) with `node:assert/strict`
- **c8** for coverage (100% required for TypeScript packages)

### Test File Location
- **JavaScript packages**: `test/*.test.js`
- **TypeScript packages**: `src/test/*.test.ts`

### Test File Naming
Always use `*.test.js` or `*.test.ts` (not `.spec`).

### Example Test (JavaScript):
```javascript
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {myFunction} from '../lib/utils.js';

describe('myFunction', function () {
    it('returns expected result', function () {
        const result = myFunction('input');
        assert.equal(result, 'expected');
    });
});
```

### Example Test (TypeScript):
```typescript
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MyClass} from '../lib/MyClass.js';

describe('MyClass', function () {
    it('creates instance', function () {
        const instance = new MyClass();
        assert.ok(instance);
    });
});
```

### Running Tests
```bash
# All packages
pnpm test

# Single package
cd packages/mg-<name> && pnpm test

# With coverage (TypeScript packages)
pnpm test  # Coverage is automatic and requires 100%
```

### Fixtures
Place test fixtures in `test/fixtures/` (JS) or `src/test/fixtures/` (TS).

## Creating New Packages

### For a new source adapter (TypeScript):

1. **Create directory structure**:
   ```
   packages/mg-newsource/
   ├── package.json
   ├── tsconfig.json
   ├── .eslintrc.cjs
   └── src/
       ├── index.ts
       ├── lib/
       │   └── mapper.ts
       └── test/
           └── mapper.test.ts
   ```

2. **package.json template**:
   ```json
   {
     "name": "@tryghost/mg-newsource",
     "version": "0.0.1",
     "type": "module",
     "exports": {
       ".": {
         "development": "./src/index.ts",
         "default": "./build/index.js"
       }
     },
     "files": ["build"],
     "scripts": {
       "build": "tsc --build",
       "test": "pnpm build && node --test build/test",
       "posttest": "pnpm lint",
       "lint": "eslint src/ --ext .ts --cache"
     },
     "devDependencies": {
       "@typescript-eslint/eslint-plugin": "8.38.0",
       "@typescript-eslint/parser": "8.38.0",
       "eslint": "8.57.0",
       "eslint-plugin-ghost": "3.4.4",
       "typescript": "5.8.3"
     },
     "dependencies": {
       "@tryghost/mg-context": "workspace:*",
       "@tryghost/mg-fs-utils": "workspace:*"
     }
   }
   ```

3. **Key dependencies to consider**:
   - `@tryghost/mg-context` - Base classes with schema validation
   - `@tryghost/mg-fs-utils` - File operations, CSV parsing, ZIP handling
   - `@tryghost/mg-utils` - XML parsing and HTML/DOM manipulation (see below)
   - `@tryghost/mg-assetscraper` - Download media assets
   - `@tryghost/mg-webscraper` - Web scraping

### For a JavaScript package:
Follow existing patterns in `mg-fs-utils` or `mg-tinynews`.

## HTML & XML Parsing

**Use `@tryghost/mg-utils` for all HTML and XML parsing. Do not use `cheerio` or `jsdom`.**

Powered by [linkedom](https://github.com/WebReflection/linkedom) — lightweight and memory-efficient. See the [`mg-utils` README](packages/mg-utils/README.md) for full API documentation.

```javascript
import {xmlUtils, domUtils} from '@tryghost/mg-utils';

// XML: parse to plain JS object
const parsed = await xmlUtils.parseXml(xmlString);
const channel = parsed.rss.channel;
const items = [].concat(channel.item || []); // normalize single/array

// HTML: use processFragment for automatic cleanup
const output = domUtils.processFragment(html, (frag) => {
    frag.$('.unwanted').forEach(el => el.remove());
    return frag.html();
});

// Async version when the callback needs to await
const output = await domUtils.processFragmentAsync(html, async (frag) => {
    // ... async operations ...
    return frag.html();
});
```

## Error Handling

Use `@tryghost/errors` for structured errors:

```javascript
import errors from '@tryghost/errors';

throw new errors.InternalServerError({
    message: 'Description of what went wrong',
    context: additionalData
});
```

## Code Style

- **Do not use lodash.** Use native JS instead: `Array.find`, `Array.includes`, `Object.entries`, `Array.isArray`, `for...of`, etc. Lodash is being actively removed from this codebase.
- ESLint with `eslint-plugin-ghost` is enforced
- No console.log in production (use `// eslint-disable-next-line no-console` if needed)
- Use async/await, not promise chains
- TypeScript: use private fields (`#fieldName`) for encapsulation
- Prefer literal characters over unicode escapes in code and tests. Use `"` not `\u201c`, `'` not `\u2018`, `—` not `\u2014`, etc.
