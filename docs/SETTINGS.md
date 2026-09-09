# Settings explained

[English](SETTINGS.md) · [Українська](uk/SETTINGS.md)

[Project overview](../README.md) · [Installation](INSTALLATION.md) · [User guide](USER_GUIDE.md)

Open **Settings** in the app to adjust language, audio, and reading preferences. Start with the defaults, then change the parts that affect your comfort. The names below use the English interface.

| Setting | What it does and when to change it |
| --- | --- |
| Language | Changes the interface language between English and Ukrainian. It does not translate your story. |
| Music | Adjusts background music volume. Lower it when it competes with dialogue or narration. |
| Voice | Adjusts voice audio volume. It does not generate voice recordings. |
| Effects | Adjusts sound-effect volume independently of music and voice. |
| Text speed | Controls how quickly text appears. Adjust it to match your reading pace. |
| Text Size | Changes text size in the dialogue panel. |
| Reader font | Adjusts font scale in the reader. Use a larger setting when longer passages are difficult to read. |
| Line spacing | Adjusts the reader's line spacing. Increase it if lines feel crowded. |
| Auto-play | Enables automatic progression during playback. Choices still require a decision. |
| Parallax | Enables the layered movement effect. Disable it if you prefer a steadier presentation. |
| Background video | Controls background-video playback. Disable it when you prefer to avoid moving video backgrounds. |
| Storage | Shows storage information where supported and may offer a request for persistent browser storage. Persistence does not replace a backup or protect against manually clearing site data. |
| Cloud backup | Provides optional cloud backup setup and sign-in. It requires a configured service. |

## Local storage and backups

Your local stories belong to the current browser profile and site address. Another browser has separate data, and private browsing may discard data when the session ends.

Use a full backup from the story's project page to keep the story and its media in a portable file. A JSON-only export leaves media out. See the [backup steps](USER_GUIDE.md#7-save-a-portable-copy) before changing browsers or moving to another computer.

## Optional cloud setup

For a self-hosted source checkout, the available environment settings are documented in [`.env.example`](../.env.example). Copy it to `.env` only when configuring an optional integration. Cloud backup uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; restart the development server after changing them.

Do not put a Supabase `service_role` key in the browser configuration or commit credentials. Once the service is configured, use the app's cloud-backup controls to sign in and check its status. Merely opening the local app does not enable cloud backup.

## Optional AI assistance

AI provider settings are separate from reading preferences. The provider and connection you choose determine the required credentials and available features. Follow the [AI bridge setup guide](../tools/ai-bridge/README.md) for provider setup and local pairing. Provider usage may require a paid account or incur charges.
