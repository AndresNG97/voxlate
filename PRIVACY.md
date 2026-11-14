# Voxlate Privacy Policy

Last updated: November 14, 2026

Voxlate is a Chrome extension that translates the subtitles of YouTube videos and
reads them aloud (dubbing). It is designed to work **on your computer**: it has no
servers of its own and no user accounts, and it doesn't collect personal data.

## Summary

- We don't collect, sell or share your data.
- No analytics, advertising or tracking.
- Translation, voice and audio analysis happen on your computer.
- What gets saved (settings, translations and voices) stays in your browser, and
  you can delete it whenever you want.

## What the extension does with information

To work, Voxlate handles the following **only inside your browser**:

| Information | Purpose | Where it is processed |
|---|---|---|
| Subtitles of the YouTube video you are watching | Translating them and showing them on screen | On your computer |
| Translated text | Showing it and reading it aloud | On your computer |
| Video audio (only if you turn on *precision sync*) | Detecting when the person speaks, to time the dubbing | On your computer. It is not recorded or saved |
| Your settings (languages, voice, text size…) | Remembering your preferences | In your browser |

Voxlate only works on `www.youtube.com`. It doesn't read other websites, your
history, your passwords or your YouTube data (account, comments, subscriptions…).

## What is saved and for how long

- **Settings**: in `chrome.storage.sync`. If you have Chrome sync turned on, Google
  copies them to your other browsers signed in with the same account, just as it
  does with the settings of any extension.
- **Saved translations**: in `chrome.storage.local`, so a video doesn't have to be
  translated again. At most the last 40 videos are kept, and each translation is
  deleted after 30 days.
- **Downloaded neural voices**: in the extension's private storage (OPFS). At most
  two voices are kept; the one that has gone unused the longest is deleted
  automatically.

None of this leaves your computer to reach us.

## Connections to other services

Voxlate doesn't send anything to servers of its own. The following can happen,
always directly between your browser and the service:

- **YouTube** (`youtube.com`): subtitles are read from the page itself. If you
  choose *YouTube* as the translation engine, the extension asks YouTube for the
  translated subtitles of that video, just as if you turned them on in the player
  yourself. The [Google Privacy Policy](https://policies.google.com/privacy)
  applies.
- **Hugging Face** (`huggingface.co`): if you choose a neural voice, it is
  downloaded once from Hugging Face. Hugging Face receives the download request
  (like any website, it sees your IP address). No text or data of yours is sent.
  The [Hugging Face Privacy Policy](https://huggingface.co/privacy) applies.
- **Chrome's translator**: translation is done on your computer with Chrome's
  Translator API. Chrome itself downloads the language model the first time.
- **System voices**: if you choose a system voice marked as *online* (for example,
  some of Chrome's "Google" voices), Chrome sends the text to be read to that
  service. Local voices don't connect to anything. Voxlate lists them separately
  so you can choose.

## Permissions it requests

- `storage`: saving your settings and translations.
- `offscreen`: generating the neural voice and analyzing the audio in the
  background, without opening any window.
- `tts`: using the system voices.
- Access to `https://www.youtube.com/*`: reading the subtitles and showing the
  translation over the video.

## How to delete your data

- **Translations**: *Translation* tab → *Delete saved translations*.
- **Voices**: *Voice* tab → *Delete* next to each downloaded voice.
- **Everything**: uninstall the extension. Chrome deletes its settings,
  translations and voices.

## Limited use

Voxlate's use of information complies with the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the **Limited Use** requirements. Information is only used to provide the
translation and dubbing features you see. It isn't transferred to third parties,
isn't used for advertising or to determine creditworthiness, and no person reads it.

## Children

Voxlate doesn't collect data from anyone, including children.

## Changes to this policy

If this policy changes, the new version will be published here with a new date.
If a change affects which data is used, it will be announced in the extension's
release notes.

## Contact

For privacy questions, open an issue at
<https://github.com/AndresNG97/voxlate/issues>.
