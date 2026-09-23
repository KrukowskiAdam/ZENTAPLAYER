# Code Signing Policy

## macOS

Release `.dmg` files are signed with a Developer ID Application certificate
and notarized through Apple's `notarytool`, run locally by the maintainer
(Apple's signing certificates cannot be issued to a CI runner). Verify a
downloaded build with:

```bash
spctl -a -vv "Espresso Player.app"
```

## Windows

Release `.exe` installers are built by
[`.github/workflows/build.yml`](.github/workflows/build.yml) on a
GitHub-hosted `windows-latest` runner, directly from the tagged commit in
this public repository — the build is reproducible from source, nothing is
altered after packaging. The `.exe` installer attached to GitHub Releases is
currently **unsigned**, so Windows SmartScreen may warn on first run.

The same workflow also builds an MSIX (`.appx`) package for the
**Microsoft Store**. Store packages are signed by Microsoft during Store
certification, so installing Espresso Player from the Microsoft Store
shows no SmartScreen warning.

- **Repository:** https://github.com/KrukowskiAdam/ZENTAPLAYER
- **License:** [MIT](LICENSE)
- **Build workflow:** `.github/workflows/build.yml` (`build-win` job —
  `dist:win` for the `.exe`, `dist:appx` for the Store package)
- **Privileged roles:** the repository owner (Adam Krukowski) is the sole
  author, reviewer, and release approver. Repository and Microsoft Partner
  Center access both require multi-factor authentication.

## Reporting a concern

If a release binary doesn't match what this repository's source and build
workflow would produce, please open an issue at
https://github.com/KrukowskiAdam/ZENTAPLAYER/issues.
