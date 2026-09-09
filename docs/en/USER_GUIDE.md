# Create your first visual novel

[English](USER_GUIDE.md) · [Українська](../uk/USER_GUIDE.md)

[Project overview](../../README.md) · [Installation](INSTALLATION.md) · [Settings](SETTINGS.md)

Start with the app open in your browser. If you have not reached that point yet, follow the [installation guide](INSTALLATION.md) first.

We will make a small story: a traveller reaches a fork in the road and chooses where to go. Keeping the first example small makes it easier to understand how writing, choices, and playback fit together.

## 1. Open Studio and create a story

Open **Studio** from the home screen and use the new-story control. Give the story a title such as **The Fork in the Road**, complete the requested project details, and open its editor.

Studio is where you find and manage projects. A story's project page gives you access to editing, reading, backups, and release tools. Inside the editor, you work with scenes and their contents.

You can also open a bundled demo first to see how a complete story is arranged.

## 2. Write the opening scene

Create or select the first scene and call it **The crossroads**. Write a short narration paragraph in the scene document:

> The road split beneath an old oak. Beyond the left path, a village bell rang. On the right, the forest was silent.

Scenes are document pages. Write the story text first, then add the actions that should happen around it. The order of the scene's content determines what the reader encounters.

## 3. Add a character and a background

Add a traveller to the story's character collection. If you have a suitable image, add a sprite for that character. Add a background image through the media library as well.

In the scene editor's insertion controls, add a background action and select your image. Add a character action to show the traveller and choose a position. Place those actions before the text that should appear over them.

Use a character line/speaker token in the document to write dialogue for the traveller:

> I should reach shelter before sunset.

Preview the scene. You should see the background, the traveller if a sprite is configured, and the text in the intended order. You can continue with a text-only story if you do not have artwork yet.

## 4. Create two destinations

Add two more scenes: **The village** and **The forest**. Give each one a short paragraph so you can recognize it during playback.

- Village: “Warm light spilled from the inn onto the empty square.”
- Forest: “A branch cracked somewhere beyond the trees.”

Create the destinations before connecting the choice, so they are available to select.

## 5. Add the reader's choice

Return to **The crossroads**. After the opening text and dialogue, insert a choice with two options:

| Option text | Destination scene |
| --- | --- |
| Follow the village bell | The village |
| Enter the forest | The forest |

Set each option's target scene. The visible option text tells the reader what they are choosing; the destination determines where the story continues.

## 6. Test both routes

Preview the opening scene to check its appearance and action order. Then open **Play novel** from the story's project page and play from the beginning.

Choose the village route and confirm that the village paragraph appears. Start again and choose the forest route. Checking both paths catches a common authoring mistake: two different options accidentally pointing to the same scene.

If something looks wrong, return to the editor, adjust the scene, and replay the affected route.

## 7. Save a portable copy

Let autosave finish, then open the story's project page and find its backup controls. Create a **full copy/full backup** to download a `.vnebackup` containing the story and its media.

A text-only JSON export contains the story structure without the media files. It is useful for text and structure, but it is not a complete portable copy of an illustrated story.

To restore a copy, use **Import** in Studio, select your backup, and review the import options. After restoring, check the scenes and media before relying on the copy.

## Where to go next

Once the two-route example works, expand one part at a time:

- Add music and sound actions to support the scene's mood.
- Use effects, transitions, and camera actions to stage key moments.
- Use variables to remember decisions and conditions to make later options depend on them.
- Add interactive objects where a scene needs reader interaction.

The [action reference](../../wiki/block-types-reference.md) describes available action types and their fields. It also contains runtime details; dialogue in the current editor is authored through character lines in the document.

For a version you want to share with readers, follow [Releasing a story](../../wiki/releases.md). A release freezes a particular version; a backup is for preserving and restoring your editable work. Desktop and Android packaging have [separate](../../wiki/releases-desktop.md) [guides](../../wiki/releases-android.md) and additional requirements.

## Everyday working habits

Use one editing tab at a time. Concurrent edits cannot be merged safely. Return to the same browser profile and address, and keep full backups outside browser storage, especially before updates or large rewrites.

Adjust reading comfort through the [settings guide](SETTINGS.md). AI assistance and cloud backup are optional; neither is needed to complete this tutorial.
