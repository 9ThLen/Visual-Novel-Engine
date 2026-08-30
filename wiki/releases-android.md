# Releasing a story as an Android app

The Android channel turns a release into an application a reader installs: one
novel, no library, no editor, playing offline. The engine appears once, as the
launch splash.

An APK cannot be produced by the app itself, or by the browser, or by any trick
of injecting a story into a prebuilt one — the package id, the app name and the
icon live in compiled binary resources, and editing them invalidates the
signature. So the work splits: **the app authors the build, a local step stages
it, and EAS compiles and signs it.**

```bash
pnpm stage:android --release novel.vnerelease --out ./novel-android \
  --eas-project-id <your own EAS project>   # required, and it should be yours

cd ./novel-android
eas build --platform android --profile player-apk
```

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

**The output directory is not emptied unless it is safe to empty.** A directory
that already holds files no build command wrote is refused outright — naming a
path is not consenting to lose what is in it. An earlier guard only caught
`--out .` and `--out ..`, so `--out ./assets` would have deleted the art.

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

## What has not happened

**No APK has ever been built.** No machine involved in writing this had an
Android SDK, and no Expo account was used: `eas build` costs money on someone
else's account and signs with credentials that outlive the build.

So everything above the `eas build` line is implemented and checked — staging,
the identity, the native cut, the asset cut, the generated module and the runtime
that reads it. Everything below it is not:

- the APK itself, its size, and its permission list on a device;
- the launch splash, which only behaves faithfully in a release build;
- installing v2 over v1 with the saves intact;
- the post-build certificate check, which needs an artifact to check.

`EasBuilder` in [`tools/build-helper`](../tools/build-helper/README.md) **refuses
outright**, and the job never leaves `queued` — the helper asks a builder whether
it is ready before staging anything, which is the right order. Staging is
`pnpm stage:android`; wiring it into the helper is part of the submit half that
does not exist yet.

An earlier version of this page said the helper staged for real. It did not: the
server never reaches `build()` while readiness is false, so that code could not
run. It has been removed rather than left to read like a working path.

## The launcher icon

The story cover becomes the icon when it is a square PNG of at least 512px. The
**adaptive** icon — what Android 8 and later actually draw — stays the engine's:
a foreground layer needs its subject inside a safe zone that a full-bleed cover
does not have, and producing one needs a rasterizer this pipeline deliberately
does not carry. So on a modern phone the launcher shows the engine mark until
someone adds image processing. Stated here rather than discovered.
