# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

- Preferred: use GitHub's private vulnerability reporting for this repository (the **Security** tab, then **Report a vulnerability**), if it is enabled.
- Otherwise: send a message through the maintainer's contact form at <https://www.ajithmjose.com/#contact> and mark it as a Droidwire security report. Do not include exploit details until the maintainer has replied and agreed a channel.

Include the Droidwire version, macOS version, what you did, and what you observed. Sensitive details (file names, device identifiers) should be redacted from logs.

This is a volunteer-run beta project: expect an acknowledgement but no guaranteed response time or bounty.

## Scope

In scope: the Droidwire app and this repository - shell/command injection through file names, path traversal in downloads and temp files, the renderer/main-process boundary (IPC, navigation, preload), the loopback video-thumbnail server, handling of untrusted device data, and the build scripts.

Out of scope: vulnerabilities in Electron, Chromium, `adb`, libmtp or libusb themselves (report those upstream, though we want to know if Droidwire ships an affected version), attacks that need an already-compromised Mac or an already-malicious renderer, and phones that the user has deliberately authorised for debugging.

## Supported versions

Only the latest release receives fixes.
