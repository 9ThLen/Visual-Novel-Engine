# Releasing a story as an Android app

The Android channel turns a release into an application a reader installs: one
novel, no library, no editor, playing offline. The engine appears once, as the
launch splash.

An APK cannot be produced by the app itself, or by the browser, or by any trick
of injecting a story into a prebuilt one — the package id, the app name and the
icon live in compiled binary resources, and editing them invalidates the
signature. So the work splits: **the app authors the build, the local helper
stages and follows it, and EAS compiles and signs it.** After one-time EAS setup,
the normal path is the Android block on the story's Release card. The command
below remains the diagnostic/manual staging path.

```powershell
pnpm stage:android --release novel.vnerelease --out ./novel-android --eas-project-id <your-own-eas-project-uuid>
Set-Location ./novel-android
$env:EAS_SKIP_AUTO_FINGERPRINT = '1'
eas build --platform android --profile player-apk
```

Two things about that command, both found by running it rather than by reading:

- **The staged project is a git repository**, created by staging. `eas build`
  refuses to run outside one, and asks on stdin whether it may run `git init` —
  a question an automated staging run cannot answer. Nothing is committed: the
  project carries `.easignore`, so the CLI archives the working directory rather
  than the git index.
- **`EAS_SKIP_AUTO_FINGERPRINT=1` is not optional.** Staging links `node_modules`
  into the staged project as a junction, because the EAS CLI reads the app config
  locally before uploading and cannot resolve config plugins without it. That
  same junction crosses onto another drive, and the fingerprint step follows it
  and produces a path that is the staged directory with an absolute path
  concatenated onto the end. The junction has to stay; the fingerprint has to go.

## What staging does, and why each part exists

**A separate project, not a flag on this repository.** Three things the engine's
own project cannot carry:

| | |
| --- | --- |
| `expo.autolinking.android.exclude` | Lives in `package.json`, which the studio shares — and the studio needs the file pickers this cut removes. |
| `appVersionSource` | The engine's `eas.json` says `"remote"`, which makes EAS's stored counter the authority and would quietly ignore the version code derived from the release. |
| the generated module | The story has to reach Metro through *static* `require` calls. Generating one means writing a file that has no business being committed. |

**The story travels as generated `require`s.** Metro bundles what it can see. An
environment variable naming a path is invisible to it, so a release passed that
way would simply not be in the APK — and the failure is a reader opening a novel
with no pictures, twenty minutes after a cloud build that reported success.
`lib/generated/player-release.ts` is one static `require` per media object, plus
the frozen story, written per build.

**Everything the player never shows is deleted.** The staged project is walked
from `app-player/` and any art nothing imports is dropped. For the demo release
that is 41 files and 113 MB — demo backgrounds, sample music, sprites and splash
screens that were inside every artifact because a static `require` named them.
What remains is the engine (about 3 MB of source, 9 MB with its icons) plus the
release's own media.

**A release that names art it does not carry is refused.** The web exporter only
warns, because a `--dist` pointing at a full Expo build still holds the app's own
`assets/` tree and the picture may still appear. Nothing rescues it here: the
player profile substitutes an empty bundled-asset map and staging then deletes
the files, so an unpackaged reference is a guaranteed blank image on a stranger's
phone.

**The output directory is replaced only after the new project verifies.** A
regular file, symlink/junction, input overlap, forged marker, or directory with
unowned files is refused outright. Staging happens in a fresh sibling and the
last complete output remains intact if staging fails.

**The editor is not in the upload.** The authoring component trees are removed,
and so is every route under `app/` that the player root does not re-export.
Metro would not have bundled them, but "the archive contains no editor code"
should be true of the archive, not only of the bundle.

## What `pnpm stage:android` checks

Four passes, all runnable without an Android SDK or an Expo account:

1. **Structural** — the autolinking exclusions are present, `appVersionSource` is
   `local`, both build profiles exist, emit the formats they claim and agree
   about which application they are building, the release parses the way the
   *runtime* will parse it, every file the asset map names is on disk, every
   `require` in the generated module resolves, and none of the media has an
   extension Metro will not bundle. That last list is checked against Metro's own
   `assetExts` by a test, because it was wrong once: `.weba` — what a release
   calls an `audio/webm` object — was accepted here and silently dropped there.
2. **Completeness** — the player's whole module graph is walked *inside the
   staged copy*. An allowlist that missed a directory otherwise produces a
   project that uploads cleanly and fails in Metro twenty minutes later.
3. **Resolved config** — `expo config` inside the staged project, asserting the
   name, version, package, version code, router root and blocked permissions.
4. **Native modules** — `expo-modules-autolinking resolve -p android` inside the
   staged project. This repository links 31 native modules; the staged project
   links 27. The four excluded ones are the file pickers, secure storage and
   notifications, and this is the check that proves they are gone rather than
   merely written down.

## The package name decides whether saves survive

`com.vne.story.<readable part of the story id>.s<hash of the whole story id>`,
derived from the **story id** and nothing else. Android treats a changed package
as a different app: derived from the title it would orphan every save the first
time the author renamed their novel, and without the hash two stories whose ids
slugify alike would install over each other and inherit each other's saved games.

The rules are in [`lib/release/native-identity.ts`](../lib/release/native-identity.ts),
shared with the desktop channel.

## The URL scheme

Derived from the application id, so every novel registers its own.

Every build used to carry the engine's. Two novels installed on one phone
therefore registered the same custom scheme, and the OS resolves duplicate
registrations arbitrarily — a link meant for one opens the other, and a player
can end up in front of the studio's own OAuth redirect on a device that has both.
The scheme is part of an application's identity, so it comes from the application
id like the rest of it.

## The version code

`major * 1000000 + minor * 1000 + patch`, so `2.1.0` is `2001000`.

**This is a correction to the plan**, which specified a counter reserved
atomically before submit and never returned on failure. A derived code is
monotonic by construction — a release version is already refused unless it is
strictly newer than the last one — so there is no counter to reserve, nothing to
race for, and no way for a crashed helper to strand a number. It also gets the
concurrency case right in the other direction: two requests for the *same*
release must produce the *same* code, because an APK and an AAB of one release
are one version of the app.

The cost is that the codes are sparse. Android only compares them.

## Signing, and the part that bites later

Android refuses to install an update signed with a different key than the
installed version. Two keys get confused, and the difference decides how bad a
loss is:

- the **app signing key**, which signs what the device installs;
- the **upload key**, which only authenticates uploads to Play.

Under Play App Signing, Google holds the app signing key and a lost upload key
can be reset. **For a sideloaded APK there is no such escape hatch:** lose that
key and every installed copy is stranded — the reader has to uninstall, losing
their saves, before they can take an update.

Since sideloading is the default here, the keystore is the most fragile artifact
in the pipeline. EAS holds it per project, which is why `--eas-project-id` should
be **the author's own**: their builds, their account, their credentials. Never
store a private key in IndexedDB.

Because EAS manages the credentials, the certificate cannot be checked before a
build — there is no stable non-interactive way to read the fingerprint ahead of
one. The check belongs *after* the artifact comes back, comparing its signing
certificate against the stored fingerprint before it is handed to the author.

## Size

Sideloaded APKs have no platform limit. Play does:

| Route | Ceiling |
| --- | --- |
| Play, legacy APK | 100 MB |
| Play, AAB — one device's download | 200 MB compressed |
| Play, AAB — base module upload | 500 MB |

The 200 MB figure is the per-device *download*, not the `.aab` file, so measuring
it with `ls -l` measures the wrong number — use `bundletool get-size total`.

After the asset cut above, the engine's own contribution is small enough that the
artifact is essentially the author's media. A novel that overruns 200 MB is
nearly always carrying unoptimised PNG and WAV; the engine's job there is
measurement, not re-encoding. See
[RELEASE-PLAN.md](../RELEASE-PLAN.md#when-the-novel-is-genuinely-bigger-than-200-mb).

## For readers, when you hand out an APK

Android asks permission to install apps from outside Play, once, per source. Say
so on the download page — a reader who meets that prompt with no warning
concludes the file is malware, which is the correct instinct.

The app asks for no permissions. It reads a story; it does not pick files, take
photos, or post notifications, and the manifest says so.

## What the first real APK looked like

Built 2026-09-02 from the demo release: 168.9 MB, signed, `1.0.0` / version code
`1000000`, twenty minutes. Read out of the artifact rather than assumed:

| | |
| --- | --- |
| media | inside, under `res/` with minified names (`res/fG.mp3`, 11.3 MB) |
| native libraries | 72 MB across four ABIs; one device uses about a quarter |
| permissions removed | CAMERA, RECORD_AUDIO, READ/WRITE_EXTERNAL_STORAGE, READ_MEDIA_*, POST_NOTIFICATIONS |
| permissions found and now blocked | `SYSTEM_ALERT_WINDOW`, `DUMP` — React Native dev support, alive in a release build |
| permissions still declared | `INTERNET`, `ACCESS_NETWORK_STATE` |

The last row is a decision rather than an oversight: a novel whose media ships
inside it needs neither, but removing them could break `expo-asset` or
`expo-updates` at runtime in ways nothing here can test. Reach for `player-aab`
before worrying about the size — the four ABIs are most of what a single device
never uses.

## What has and has not happened

**No APK has ever been built.** No machine involved in writing this had an
Android SDK, and no Expo account was used: `eas build` costs money on someone
else's account and signs with credentials that outlive the build.

The EAS adapter is implemented: readiness, staging, archive inspection, submit,
poll, remote cancel, HTTPS artifact download, server-side hash/ZIP checks and a
second size/hash check in the browser. It also persists the binding between one
EAS project and one novel. It has been exercised against a simulated EAS CLI,
not against a paid account. The following therefore remains physical acceptance,
not an implemented-code gap:

- the APK itself, its size, and its permission list on a device;
- the launch splash, which only behaves faithfully in a release build;
- installing v2 over v1 with the saves intact;
- the post-build certificate check, which needs an artifact to check.

`EasBuilder` in [`tools/build-helper`](../tools/build-helper/README.md) refuses a
new request before accepting its archive when EAS CLI, login, or the novel's
project UUID is unavailable. Signing credentials are deliberately configured
outside the browser; builds use `--freeze-credentials` so a click cannot replace
a keystore.

## The launcher icon

The story cover becomes the icon when it is a square PNG of at least 512px. The
**adaptive** icon — what Android 8 and later actually draw — stays the engine's:
a foreground layer needs its subject inside a safe zone that a full-bleed cover
does not have, and producing one needs a rasterizer this pipeline deliberately
does not carry. So on a modern phone the launcher shows the engine mark until
someone adds image processing. Stated here rather than discovered.
