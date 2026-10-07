# Retiring the old Firebase project (plan only - nothing here was executed)

No live infrastructure was touched or inspected beyond what the old source code and git history show. Do these in the Firebase console / CLI yourself.

## What exists (from the removed code)

- Firebase project `droidwire-3c7f0`, Firestore database `(default)`.
- Collection `beta_signups`: one document per sign-up with `email`, `createdAt`, `appVersion`. Written by Droidwire <= 1.2.1 on first launch (and retried on every launch until it succeeded).
- Collection `messages`: documents you wrote by hand (`title`, `body`, `url`, `audience`, `active`); read by Droidwire 1.2.x on every launch.
- The Firebase **web API key** is in the source and in git history. It is public client configuration, not a secret, but it is only as safe as the Firestore security rules behind it. **The rules were never verified** - the code comments and old notes say `beta_signups` is create-only and `messages` world-readable. Read the actual rules before doing anything else (console > Firestore > Rules) and write down what they allow.

## Older clients

Droidwire 1.0.x-1.2.1 builds in the wild keep contacting the project: 1.2.0/1.2.1 POST the stored email at start-up until it syncs, and fetch `messages` every launch. If the project is deleted or locked, they fail silently (the old code swallows network errors) - nothing crashes - but they also never see a migration notice. Current builds make no Firebase request at all.

## Suggested sequence

1. **Look at the rules and the data** (read-only): confirm who can read `beta_signups`; count documents; check the project's usage/billing page.
2. **Decide what the emails are for.** The old site said they were for update notices and a possible supporter offer, stored privately and "removed on request". Droidwire is now MIT and free, so the clean options are (a) one final "Droidwire moved and is open source" email to that list, then delete the collection, or (b) delete the collection without contacting anyone. Do not use the list for anything else. Honour any deletion request already received.
3. **Optional migration notice for old clients:** before locking anything, add one `messages` document (`active: true`, `audience: "all"`, `title: "Droidwire has moved"`, `body: ...`, `url: "https://github.com/ajithonmain/droidwire/releases/latest"`). Droidwire 1.2.x shows it as a banner. (Droidwire <= 1.2.1 also checks `droidwire-releases` for a newer tag; see `announcement-droidwire-releases.md`.)
4. **Export before deleting** if you want a record: console export or `gcloud firestore export` (this puts a copy of personal data in a bucket - delete that too when done).
5. **After a grace period (30-60 days):** set rules to `allow read, write: if false;`, then delete the `beta_signups` and `messages` collections, then delete the project (or at least disable the Firestore API and delete the web API key). Deleting the project is irreversible and removes the key's value to anyone who copied it from git history.
6. Update nothing in this repository afterwards: the app no longer references the project. The key will remain in git history; that is acceptable once the project is gone.

## Not done here
Everything above. No rules, data, keys or projects were read, changed or deleted.
