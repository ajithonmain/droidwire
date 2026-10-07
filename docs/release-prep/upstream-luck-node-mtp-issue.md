# Draft: request for a LICENSE file in luck-node-mtp (NOT POSTED)

Suggested text for an issue on https://github.com/lucksoft-yungui/luck-node-mtp. It has not been posted; posting is the owner's decision (it is a public message under their name).

> **Title:** Please add a LICENSE file (package.json says ISC)
>
> Hi, and thanks for luck-node-mtp - it is the MTP backend of Droidwire (https://github.com/ajithonmain/droidwire), an MIT-licensed macOS file manager for Android phones.
>
> `package.json` declares `"license": "ISC"` and `"author": "lucksoft"`, but the repository and the npm package contain no LICENSE file, so there is no copyright line or year to carry in third-party notices. Could you add a `LICENSE` file with the ISC text and the copyright holder/year you intend? Until then we credit "Copyright (c) lucksoft" with no year and say so in our notices.
>
> For transparency: we apply a small patch (storage-root parent handling for upload/copy/move, and returning an error instead of crashing when the device cannot be opened or has no storage). We are glad to upstream it if you would like it.
