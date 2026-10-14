import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const local = createRequire(path.resolve('.compat/dsh/runtime-test.cjs'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.startsWith('file:')) {
      try { return nextResolve(pathToFileURL(local.resolve(specifier)).href, context); } catch { /* Keep built-ins and normal resolution. */ }
    }
    return nextResolve(specifier, context);
  }
});
