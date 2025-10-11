Discord Server Setup CLI
========================

Programmatically set up a Discord community server (guild) from a YAML config: roles, channels, categories, and permission overwrites. Includes a dry-run mode and a quick validator.

Quick Start
-----------

- Create a Discord application + bot, invite it to your server with permissions to manage roles and channels (Administrator recommended for first-time sync).
- In this folder, install deps and run sync:

  - npm install
  - Copy `config/example.guild.yaml` → `config/guild.yaml` and edit
  - Set env and run:

    - DISCORD_TOKEN=your_bot_token GUILD_ID=your_guild_id npm run validate -- --config config/guild.yaml
    - DISCORD_TOKEN=your_bot_token GUILD_ID=your_guild_id npm run sync -- --config config/guild.yaml --dry
    - Remove `--dry` to apply changes

Invite URL
----------

- Put your application ID in `.env` as `DISCORD_CLIENT_ID=...` (or `CLIENT_ID=`). Then run:
  - npm run invite
- Customize permissions or scopes:
  - npm run invite -- --permissions Administrator,ManageChannels
  - npm run invite -- --permissions 8
  - npm run invite -- --scopes bot,applications.commands

Config Shape
------------

- name: Optional guild name (will be applied)
- pruneExtraneous: If true, deletes roles/channels not in config
- roles: Array of roles
  - name, color (hex), hoist, mentionable, permissions[], position
- channels: Array of channels and categories
  - type: `category` | `text` | `voice`
  - Common fields: name, position, parent (for non-category), overwrites[]
  - text: topic, nsfw, rateLimitPerUser
  - voice: bitrate, userLimit

Permission Overwrites
---------------------

- overwrites[].role can be a role name or `id:<roleId>`
- allow/deny values use discord.js `PermissionFlagsBits` keys (e.g., `ViewChannel`, `ManageMessages`, `Administrator`).

CLI
---

- Validate only:
  - DISCORD_TOKEN=... GUILD_ID=... npm run validate -- --config config/guild.yaml
- Sync with dry-run:
  - DISCORD_TOKEN=... GUILD_ID=... npm run sync -- --config config/guild.yaml --dry
- Apply changes:
  - DISCORD_TOKEN=... GUILD_ID=... npm run sync -- --config config/guild.yaml

Notes
-----

- The bot needs `Manage Roles` and `Manage Channels` (and preferably Administrator) to perform updates.
- Positions are applied best-effort; Discord may adjust based on hierarchy.
- The sync is idempotent by name matching; rename in config will create a new resource unless you prune or manually delete.
- `pruneExtraneous: true` will delete roles/channels not present in config (use with care).
