# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Overview

This is a Ghost blog migration toolkit - a monorepo with 45+ packages for migrating content from various platforms to Ghost. Requires **Node >= 22.13.1**.

## Package Manager & Dependencies

- **Always use `yarn` (v1) for all commands.** This repository uses yarn workspaces with Lerna, not npm.
- Install dependencies with `yarn` and pass the `exact` flag, like `yarn add -E lodash`. If the dependency is for development, pass the `dev` flag, like `yarn add -E -D lodash`
- **Always pin exact versions.** Use `"1.2.3"`, not `"^1.2.3"` or `"~1.2.3"`.

## Common Commands

### Development
```bash
yarn                           # Install dependencies
yarn dev                       # Local dev with tsx
yarn dev:debug                 # Dev with DEBUG=@tryghost*,migrate:* enabled
```

### Building
```bash
yarn build                     # Build all TypeScript packages
yarn build:watch               # Watch mode for TypeScript
```

### Testing
```bash
yarn test                      # Run tests + lint for all packages
yarn test:only                 # Run tests only (no lint)

# Single package
cd packages/<name> && yarn test
```

### Linting
```bash
yarn lint                      # Lint all packages
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
   import _ from 'lodash';

   // Wrong
   const _ = require('lodash');
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
- **Existing packages** use Jest 30 with `NODE_OPTIONS=--experimental-vm-modules` for ESM support
- **New packages** should use Node's built-in test runner with `node:assert/strict`
- **c8** for coverage (100% required for TypeScript packages)

### Test File Location
- **JavaScript packages**: `test/*.test.js`
- **TypeScript packages**: `src/test/*.test.ts`

### Test File Naming
Always use `*.test.js` or `*.test.ts` (not `.spec`).

### Example Test (JavaScript):
```javascript
import {describe, it, expect} from '@jest/globals';
import {myFunction} from '../lib/utils.js';

describe('myFunction', function () {
    it('returns expected result', function () {
        const result = myFunction('input');
        expect(result).toEqual('expected');
    });
});
```

### Example Test (TypeScript - new packages with Node test runner):
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
yarn test

# Single package
cd packages/mg-<name> && yarn test

# With coverage (TypeScript packages)
yarn test  # Coverage is automatic and requires 100%
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
       "test": "yarn build && node --test build/test",
       "lint": "eslint src/ --ext .ts --cache",
       "posttest": "yarn lint"
     },
     "devDependencies": {
       "@typescript-eslint/eslint-plugin": "8.38.0",
       "@typescript-eslint/parser": "8.38.0",
       "eslint": "8.57.0",
       "eslint-plugin-ghost": "3.4.4",
       "typescript": "5.8.3"
     },
     "dependencies": {
       "@tryghost/mg-context": "0.0.1",
       "@tryghost/mg-fs-utils": "0.0.1"
     }
   }
   ```

3. **Key dependencies to consider**:
   - `@tryghost/mg-context` - Base classes with schema validation
   - `@tryghost/mg-fs-utils` - File operations, CSV parsing, ZIP handling
   - `@tryghost/mg-assetscraper` - Download media assets
   - `@tryghost/mg-webscraper` - Web scraping with Cheerio
   - `cheerio` - HTML parsing

### For a JavaScript package:
Follow existing patterns in `mg-fs-utils` or `mg-tinynews`.

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

- ESLint with `eslint-plugin-ghost` is enforced
- No console.log in production (use `// eslint-disable-next-line no-console` if needed)
- Use async/await, not promise chains
- TypeScript: use private fields (`#fieldName`) for encapsulation
