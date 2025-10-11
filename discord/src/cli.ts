#!/usr/bin/env node
import 'dotenv/config';
import { loadConfig } from './config.js';
import { syncGuild } from './sync.js';
import { buildInviteUrl } from './invite.js';
import { resolvePermissions } from './permissions.js';

function usage() {
  console.log(
    `Usage:
  DISCORD_TOKEN=... GUILD_ID=... npm run sync -- --config config/guild.yaml [--dry]
  DISCORD_TOKEN=... GUILD_ID=... npm run validate -- --config config/guild.yaml
  npm run invite [-- --permissions Administrator,ManageChannels] [--scopes bot,applications.commands]

Flags:
  --config, -c   Path to YAML config file
  --dry          Dry-run (log actions without making changes)
  invite flags:
  --permissions, -p  Permission names (comma list) or integer bitfield (default: Administrator)
  --scopes, -s       Scopes (comma list). Default: bot,applications.commands
`
  );
}

function parseArgs(argv: string[]) {
  const args = { command: '', config: '', dry: false, permissions: '', scopes: '' } as {
    command: 'sync' | 'validate' | 'invite' | '';
    config: string;
    dry: boolean;
    permissions: string;
    scopes: string;
  };
  const [,, cmd, ...rest] = argv;
  if (cmd === 'sync' || cmd === 'validate' || cmd === 'invite') args.command = cmd;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--dry') args.dry = true;
    else if (a === '--config' || a === '-c') {
      args.config = rest[++i];
    } else if (a === '--permissions' || a === '-p') {
      args.permissions = rest[++i] ?? '';
    } else if (a === '--scopes' || a === '-s') {
      args.scopes = rest[++i] ?? '';
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.command || (args.command !== 'invite' && !args.config)) {
    usage();
    process.exit(1);
  }
  try {
    if (args.command === 'invite') {
      const clientId =
        process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || process.env.APPLICATION_ID;
      if (!clientId) throw new Error('Missing DISCORD_CLIENT_ID (or CLIENT_ID) in env');

      // Scopes
      const scopes = (args.scopes || 'bot,applications.commands')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Permissions: int or comma list of names
      let permsStr: string | undefined;
      const p = args.permissions?.trim();
      if (p) {
        if (/^\d+$/.test(p)) permsStr = p; // integer bitfield
        else {
          const names = p.split(',').map((x) => x.trim()).filter(Boolean) as any;
          const bitfield = resolvePermissions(names);
          permsStr = bitfield.toString();
        }
      } else {
        // Default to Administrator for setup convenience
        const bitfield = resolvePermissions(['Administrator' as any]);
        permsStr = bitfield.toString();
      }

      const url = buildInviteUrl(clientId, scopes, permsStr);
      console.log('Invite URL:');
      console.log(url);
      return;
    }

    const cfg = await loadConfig(args.config);
    if (args.command === 'validate') {
      console.log('Config OK');
      process.exit(0);
    }
    const token = process.env.DISCORD_TOKEN;
    const guildId = process.env.GUILD_ID;
    if (!token) throw new Error('Missing DISCORD_TOKEN env');
    if (!guildId) throw new Error('Missing GUILD_ID env');
    await syncGuild({ token, guildId, config: cfg, dryRun: args.dry });
  } catch (err: any) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  }
}

main();
