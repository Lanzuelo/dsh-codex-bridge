# Publishing DSH Codex Architect

Public source: https://github.com/Lanzuelo/dsh-codex-bridge
Published npm package: https://www.npmjs.com/package/dsh-codex-architect (latest 0.1.2).
Registry metadata and the published tarball checksum were verified.
The previous package name dsh-codex-bridge belongs to an unrelated npm project.

## Publication checklist

1. Authenticate through npm's official browser login; never put credentials in source files.
2. Run syntax checks, core tests and the actual Harness runtime smoke test.
3. Review npm pack output, unpack the archive and verify package.json, bundle module name and browser ModuleLoader ID all use dsh-codex-architect.
4. Publish the exact reviewed tarball with public access. Keep the default latest tag so Harness can resolve the short name; documentation must retain the preview compatibility limitations.
5. Verify registry name, version, repository, integrity and actual download/install of dsh-codex-architect@0.1.2.
6. Push the reviewed source to GitHub, tag v0.1.2 and attach the exact published archive/checksum to a preview release.
7. Only after registry verification state that installation by the short name is available.

The npm account may differ from the GitHub account. First publication can require
2FA or a browser confirmation. The user enters credentials on npm itself.

## Distribution

Harness → Plugins → Add package: dsh-codex-architect

Registry publication is confirmed; the short name resolves to version 0.1.2.
An exact version can be requested with dsh-codex-architect@0.1.2.
The existing GitHub-only 0.1.0 preview remains available at
github:Lanzuelo/dsh-codex-bridge#v0.1.0.

Do not install the old GitHub package and the new npm package simultaneously in
one Harness profile: both register /codex. Disable/remove the old plugin before
switching sources. Existing ~/.dsh-codex-bridge state is preserved by the rename.

Subsequent CI publication can use npm trusted publishing (OIDC), once configured
for the actual npm package owner. There is no automatic npm publish workflow or
publishing token in this repository.

This is an independent MIT-licensed preview for official Harness Desktop
0.2.0-rc.2 on Windows, not an official OpenAI/DeepSeek product. Live Desktop
installation remains an outstanding acceptance check.

References: https://docs.npmjs.com/cli/commands/npm-publish/ and
https://docs.npmjs.com/trusted-publishers/.
