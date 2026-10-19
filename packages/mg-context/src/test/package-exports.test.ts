import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

type PackageJson = {
    types?: string;
    exports?: Record<string, Record<string, string>>;
    publishConfig?: {
        exports?: Record<string, Record<string, string>>;
    };
};

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('package exports', () => {
    it('Makes declarations reachable to NodeNext consumers without publishing source files', async () => {
        const packageJson = JSON.parse(
            await readFile(new URL('../../package.json', import.meta.url), 'utf8')
        ) as PackageJson;

        assert.equal(packageJson.types, './build/index.d.ts');
        assert.deepEqual(packageJson.exports?.['.'], {
            types: './build/index.d.ts',
            source: './src/index.ts',
            default: './build/index.js'
        });
        assert.deepEqual(packageJson.publishConfig?.exports?.['.'], {
            types: './build/index.d.ts',
            default: './build/index.js'
        });

        const consumerRoot = await mkdtemp(join(tmpdir(), 'mg-context-nodenext-'));
        const packagePath = join(consumerRoot, 'node_modules', '@tryghost', 'mg-context');

        try {
            await mkdir(dirname(packagePath), {recursive: true});
            await symlink(packageRoot, packagePath, process.platform === 'win32' ? 'junction' : 'dir');
            await writeFile(
                join(consumerRoot, 'index.mts'),
                "import {MigrateContext} from '@tryghost/mg-context';\nconst context: MigrateContext = new MigrateContext();\nvoid context;\n"
            );

            const tscPath = join(dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))), 'bin', 'tsc');
            await execFileAsync(
                process.execPath,
                [
                    tscPath,
                    '--noEmit',
                    '--strict',
                    '--skipLibCheck',
                    '--module',
                    'nodenext',
                    '--moduleResolution',
                    'nodenext',
                    '--target',
                    'es2022',
                    'index.mts'
                ],
                {cwd: consumerRoot}
            );
        } finally {
            await rm(consumerRoot, {recursive: true, force: true});
        }
    });
});
