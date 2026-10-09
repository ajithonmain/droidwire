# Announcement for the old `droidwire-releases` repository (NOT PUBLISHED)

The old repo (`ajithonmain/droidwire-releases`, latest release `v1.2.1-beta`) is where Droidwire 1.2.x checks for updates. A new release there, with notes pointing at the main repository, reaches those clients: they treat any tag different from their own version as "an update" and open that repo's `releases/latest` page when the user clicks Download.

## Release to create (owner action)

- **Tag:** `v1.2.2-moved` (any tag that differs from `1.2.1` triggers the old clients' banner; keep it recognisably not a real build)
- **Title:** `Droidwire has moved to ajithonmain/droidwire`
- **Attach no binaries.**
- **Notes:**

> Droidwire is now open source (MIT) and its releases live in the main repository:
> **https://github.com/ajithonmain/droidwire/releases**
>
> This repository is no longer updated. Please download the latest build from the link above.
>
> What changed for you:
> - Nothing to install first: adb and video thumbnails are now built into the app.
> - No sign-up: the email prompt and all background announcements are gone. Droidwire no longer contacts anything except GitHub's release API, and that check can be turned off in the Droidwire menu.
> - Issues and source: https://github.com/ajithonmain/droidwire
>
> Builds are not yet signed or notarized by Apple, so macOS asks you to clear the quarantine flag once; the instructions are in the new repository's README.

Then, in this repo's `README`, replace the content with a single pointer to the new repository and archive the repository (Settings > Archive). Do not delete it: old clients and old download links still resolve here.
