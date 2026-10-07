# Releasing Droidwire

## Build a release candidate

```bash
npm run native:build                 # once, then cached: adb from AOSP, libusb, libmtp, thumbnail helper
npm run verify                       # typecheck, unit tests, production build
npm --prefix desktop run dist        # stage + package + package checks
node desktop/driver.mjs --app desktop/release/mac-arm64/Droidwire.app    # packaged-app smoke test
```

`dist` prints which signing mode it is using. Without credentials it produces an **unsigned** build (ad-hoc sealed so macOS will run it, but Gatekeeper still blocks a downloaded copy until the user clears the quarantine flag). `scripts/check-package.mjs` runs automatically and fails the build if a required component is missing or would not run on another Mac.

The same steps run in GitHub Actions: `.github/workflows/release-build.yml` (manual or on a `v*` tag). It uploads the artifacts and, for tags, creates a **draft** release only.

## Signing and notarization (owner action)

Gatekeeper only lets a downloaded app open without friction if it is signed with a **Developer ID Application** certificate and **notarized** by Apple (Apple: "Notarizing macOS software before distribution", https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution - hardened runtime, secure timestamp, `notarytool` submission, stapled ticket). This needs a paid Apple Developer Program membership; nothing in the repository contains or requires your credentials.

1. In your Apple Developer account create a **Developer ID Application** certificate, export it with its private key as a `.p12`.
2. Create an **App Store Connect API key** (Users and Access > Integrations > Team Keys) for notarization, or use an app-specific password.
3. Provide credentials to the build through environment variables only (locally, or as GitHub repository secrets for the workflow):

   | Purpose | Variables |
   |---|---|
   | Signing | `CSC_LINK` (path or base64 of the .p12), `CSC_KEY_PASSWORD` - or install the certificate in your login keychain |
   | Notarization, API key | `APPLE_API_KEY` (path to the .p8), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
   | Notarization, Apple ID | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

4. Build with `npm --prefix desktop run dist -- --require-signed`. It refuses to produce anything unless signing and notarization are possible, signs every Mach-O (the bundled adb, libusb, libmtp, MTP addon and thumbnail helper are signed with the same identity as the app, so macOS library validation stays on), uses the entitlements in `desktop/build/entitlements.mac.plist`, notarizes, staples, and then `check-package.mjs --require-signed` verifies the Developer ID signature, hardened runtime and stapled ticket.

The signing and notarization steps have been written against electron-builder 25's documented options but **could not be executed** here: no Developer ID identity or Apple credentials were available. Expect to iterate on the first real run (the most likely issues are certificate import and notarization credentials, not the app).

## Publishing (owner action)

Nothing in this repository publishes automatically. After testing the artifacts:

```bash
gh release create vX.Y.Z desktop/release/Droidwire-X.Y.Z-arm64.dmg desktop/release/Droidwire-X.Y.Z-arm64-mac.zip \
  --repo ajithonmain/droidwire --title "Droidwire X.Y.Z" --notes-file <notes>
```

Update `CHANGELOG.md` first, run the hardware checklist, and check that the README's claims (supported Macs, signing status, verified devices) still match what you are shipping.
