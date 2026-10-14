# Publishing this project

## Current state

The public source repository is [Lanzuelo/dsh-codex-bridge](https://github.com/Lanzuelo/dsh-codex-bridge).
The project is an independent preview, not an official OpenAI/DeepSeek plugin.
Release tags and attached tarballs are managed separately from npm publication.

`dsh-codex-bridge` is already registered on npm by an unrelated project. **Do not
run `npm publish` with the current unscoped package name.** The working package
name remains suitable for local/Git-source installation, but npm publication
requires an available name or a scope owned by the authenticated npm account.
A GitHub username does not establish ownership of the same npm scope.

## GitHub preview release

1. Connect GitHub and confirm access to `Lanzuelo`.
2. Review the exact source set. `.compat`, extracted vendor code, local state,
   credentials, caches, `node_modules` and artifacts are excluded from Git.
3. Run the syntax checks, core tests and a local tarball inspection. Verify
   installation in a separate official Desktop 0.2.0-rc.2 profile before calling
   it fully Desktop-tested. Keep preview limitations explicit otherwise.
4. Create the public repository and push the source. Add GitHub topic `dsh-plugin`
   for discoverability; this does not itself guarantee a marketplace listing.
5. After CI passes, tag the reviewed commit `v0.1.0`, create a preview release,
   attach the generated `.tgz`, and publish its SHA-256 checksum.
6. Test `github:Lanzuelo/dsh-codex-bridge#v0.1.0` in a separate profile. Only then
   update installation documentation from "planned" to "available".

GitHub publication allows a Git install source. It does not make the short
package name available through the npm registry.

## npm publication

1. Sign in to npm locally; never paste credentials or OTPs into an issue/chat.
2. Choose an available package name or an owned scope. A possible scoped shape
   is `@YOUR_NPM_USER/dsh-codex-bridge`; verify ownership before using it.
3. Update `package.json` name, the bundle row's module name in `cordis.patch.yml`,
   browser ModuleLoader registration ID in `src/client.js`, its contract test,
   and installation examples together. Keep the command name `/codex` and stable
   plugin state semantics unchanged.
4. Re-run tests, pack/unpack and Host-loading checks after the rename.
5. Review `npm pack --dry-run`, then publish the **exact reviewed version** with
   public access and an appropriate preview dist-tag.
6. Verify the registry's name/version/repository metadata and install the exact
   version in an isolated Harness profile before advertising short-name install.

Subsequent CI publication can use npm trusted publishing (OIDC) after the package
and publisher relationship are configured. This repository currently has **no
automatic publish workflow** and stores no publishing token.

References: [npm public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
