import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Guild,
  GuildBasedChannel,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  Role,
} from 'discord.js';
import type {
  AnyChannelConfig,
  CategoryChannelConfig,
  GuildConfig,
  OverwriteConfig,
  RoleConfig,
  TextChannelConfig,
  VoiceChannelConfig,
} from './types.js';
import { resolvePermissions } from './permissions.js';

export interface SyncOptions {
  token: string;
  guildId: string;
  config: GuildConfig;
  dryRun?: boolean;
}

function logAction(dry: boolean | undefined, message: string) {
  if (dry) console.log(`[dry-run] ${message}`);
  else console.log(message);
}

function byNameMap<T extends { name: string }>(items: Iterable<T>) {
  const map = new Map<string, T>();
  for (const i of items) map.set(i.name.toLowerCase(), i);
  return map;
}

async function ensureRoles(guild: Guild, roles: RoleConfig[] | undefined, dry?: boolean) {
  if (!roles?.length) return;
  await guild.roles.fetch();
  const existing = guild.roles.cache.filter((r) => r.name !== '@everyone');
  const map = byNameMap(existing.values());

  for (const rc of roles) {
    const found = map.get(rc.name.toLowerCase());
    const perms = resolvePermissions(rc.permissions);
    if (!found) {
      logAction(dry, `Create role: ${rc.name}`);
      if (!dry) {
        const created = await guild.roles.create({
          name: rc.name,
          color: rc.color,
          hoist: rc.hoist,
          mentionable: rc.mentionable,
          permissions: perms,
          reason: 'sync from config',
        });
        if (rc.position !== undefined) await created.setPosition(rc.position);
      }
      continue;
    }

    // Compare and update minimal fields
    const updates: Partial<Role> & { permissions?: PermissionsBitField } = {} as any;
    if ((rc.color ?? null) !== (found.hexColor ?? null)) (updates as any).color = rc.color;
    if (rc.hoist !== undefined && rc.hoist !== found.hoist) (updates as any).hoist = rc.hoist;
    if (rc.mentionable !== undefined && rc.mentionable !== found.mentionable)
      (updates as any).mentionable = rc.mentionable;
    if (rc.permissions !== undefined) {
      const current = found.permissions.bitfield;
      if (current !== perms) (updates as any).permissions = perms;
    }

    if (Object.keys(updates).length) {
      logAction(dry, `Update role: ${rc.name}`);
      if (!dry) await found.edit(updates as any, 'sync from config');
    }
    if (rc.position !== undefined && found.position !== rc.position) {
      logAction(dry, `Set role position: ${rc.name} -> ${rc.position}`);
      if (!dry) await found.setPosition(rc.position);
    }
  }
}

function resolveRoleIdByRef(guild: Guild, ref: string): string | undefined {
  if (ref.startsWith('id:')) return ref.slice(3);
  const r = guild.roles.cache.find((x) => x.name.toLowerCase() === ref.toLowerCase());
  return r?.id;
}

function buildOverwrite(guild: Guild, ov: OverwriteConfig) {
  const id = resolveRoleIdByRef(guild, ov.role);
  if (!id) return undefined;
  return {
    id,
    type: OverwriteType.Role as const,
    allow: resolvePermissions(ov.allow),
    deny: resolvePermissions(ov.deny),
  };
}

async function ensureCategory(
  guild: Guild,
  cfg: CategoryChannelConfig,
  dry?: boolean
) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === cfg.name.toLowerCase()
  );
  const overwrites = cfg.overwrites?.map((o) => buildOverwrite(guild, o)).filter(Boolean) as any[];

  if (!existing) {
    logAction(dry, `Create category: ${cfg.name}`);
    if (!dry) {
      const created = await guild.channels.create({
        name: cfg.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
        reason: 'sync from config',
      });
      if (cfg.position !== undefined) await created.setPosition(cfg.position);
      return created;
    }
    return undefined;
  }

  if (cfg.position !== undefined && existing.position !== cfg.position) {
    logAction(dry, `Set category position: ${cfg.name} -> ${cfg.position}`);
    if (!dry) await (existing as any).setPosition(cfg.position);
  }
  if (cfg.overwrites) {
    logAction(dry, `Sync overwrites for category: ${cfg.name}`);
    if (!dry) await (existing as any).permissionOverwrites.set(overwrites);
  }
  return existing;
}

async function ensureTextChannel(guild: Guild, cfg: TextChannelConfig, dry?: boolean) {
  const parentMatcher = (ch: GuildBasedChannel) =>
    cfg.parent
      ? ch.parent?.name.toLowerCase() === cfg.parent.toLowerCase() ||
        ch.parentId === (cfg.parent.startsWith('id:') ? cfg.parent.slice(3) : undefined)
      : true;
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === cfg.name.toLowerCase() && parentMatcher(c)
  );
  const parentId = cfg.parent
    ? resolveParentId(guild, cfg.parent)
    : undefined;
  const overwrites = cfg.overwrites?.map((o) => buildOverwrite(guild, o)).filter(Boolean) as any[];
  if (!existing) {
    logAction(dry, `Create text channel: ${cfg.name}${parentId ? ` (parent=${cfg.parent})` : ''}`);
    if (!dry) {
      const created = await guild.channels.create({
        name: cfg.name,
        type: ChannelType.GuildText,
        topic: cfg.topic,
        nsfw: cfg.nsfw,
        rateLimitPerUser: cfg.rateLimitPerUser,
        parent: parentId,
        permissionOverwrites: overwrites,
        reason: 'sync from config',
      });
      if (cfg.position !== undefined) await created.setPosition(cfg.position);
      return created;
    }
    return undefined;
  }
  // Update
  const updates: Record<string, any> = {};
  if (cfg.topic !== undefined && (existing as any).topic !== cfg.topic) updates.topic = cfg.topic;
  if (cfg.nsfw !== undefined && (existing as any).nsfw !== cfg.nsfw) updates.nsfw = cfg.nsfw;
  if (
    cfg.rateLimitPerUser !== undefined &&
    (existing as any).rateLimitPerUser !== cfg.rateLimitPerUser
  )
    updates.rateLimitPerUser = cfg.rateLimitPerUser;
  if (Object.keys(updates).length) {
    logAction(dry, `Update text channel: ${cfg.name}`);
    if (!dry) await (existing as any).edit(updates, 'sync from config');
  }
  if (cfg.position !== undefined && existing.position !== cfg.position) {
    logAction(dry, `Set text channel position: ${cfg.name} -> ${cfg.position}`);
    if (!dry) await (existing as any).setPosition(cfg.position);
  }
  if (cfg.overwrites) {
    logAction(dry, `Sync overwrites for text channel: ${cfg.name}`);
    if (!dry) await (existing as any).permissionOverwrites.set(overwrites);
  }
  if (cfg.parent) {
    const currentParentId = (existing as any).parentId as string | null;
    if (currentParentId !== parentId) {
      logAction(dry, `Move text channel under parent: ${cfg.name} -> ${cfg.parent}`);
      if (!dry) await (existing as any).setParent(parentId);
    }
  }
  return existing;
}

async function ensureVoiceChannel(guild: Guild, cfg: VoiceChannelConfig, dry?: boolean) {
  const parentMatcher = (ch: GuildBasedChannel) =>
    cfg.parent
      ? ch.parent?.name.toLowerCase() === cfg.parent.toLowerCase() ||
        ch.parentId === (cfg.parent.startsWith('id:') ? cfg.parent.slice(3) : undefined)
      : true;
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === cfg.name.toLowerCase() && parentMatcher(c)
  );
  const parentId = cfg.parent ? resolveParentId(guild, cfg.parent) : undefined;
  const overwrites = cfg.overwrites?.map((o) => buildOverwrite(guild, o)).filter(Boolean) as any[];
  if (!existing) {
    logAction(dry, `Create voice channel: ${cfg.name}${parentId ? ` (parent=${cfg.parent})` : ''}`);
    if (!dry) {
      const created = await guild.channels.create({
        name: cfg.name,
        type: ChannelType.GuildVoice,
        bitrate: cfg.bitrate,
        userLimit: cfg.userLimit,
        parent: parentId,
        permissionOverwrites: overwrites,
        reason: 'sync from config',
      });
      if (cfg.position !== undefined) await created.setPosition(cfg.position);
      return created;
    }
    return undefined;
  }
  const updates: Record<string, any> = {};
  if (cfg.bitrate !== undefined && (existing as any).bitrate !== cfg.bitrate) updates.bitrate = cfg.bitrate;
  if (cfg.userLimit !== undefined && (existing as any).userLimit !== cfg.userLimit)
    updates.userLimit = cfg.userLimit;
  if (Object.keys(updates).length) {
    logAction(dry, `Update voice channel: ${cfg.name}`);
    if (!dry) await (existing as any).edit(updates, 'sync from config');
  }
  if (cfg.position !== undefined && existing.position !== cfg.position) {
    logAction(dry, `Set voice channel position: ${cfg.name} -> ${cfg.position}`);
    if (!dry) await (existing as any).setPosition(cfg.position);
  }
  if (cfg.overwrites) {
    logAction(dry, `Sync overwrites for voice channel: ${cfg.name}`);
    if (!dry) await (existing as any).permissionOverwrites.set(overwrites);
  }
  if (cfg.parent) {
    const currentParentId = (existing as any).parentId as string | null;
    if (currentParentId !== parentId) {
      logAction(dry, `Move voice channel under parent: ${cfg.name} -> ${cfg.parent}`);
      if (!dry) await (existing as any).setParent(parentId);
    }
  }
  return existing;
}

function resolveParentId(guild: Guild, parent: string): string | undefined {
  if (parent.startsWith('id:')) return parent.slice(3);
  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === parent.toLowerCase()
  );
  return category?.id;
}

async function ensureChannels(guild: Guild, channels: AnyChannelConfig[] | undefined, dry?: boolean) {
  if (!channels?.length) return;
  await guild.channels.fetch();

  // Create categories first
  for (const ch of channels) {
    if (ch.type === 'category') {
      const cat = await ensureCategory(guild, ch, dry);
      if (ch.channels?.length) {
        for (const child of ch.channels) {
          if (child.type === 'text') await ensureTextChannel(guild, child, dry);
          else if (child.type === 'voice') await ensureVoiceChannel(guild, child, dry);
        }
      }
    }
  }

  // Then handle top-level channels
  for (const ch of channels) {
    if (ch.type === 'text') await ensureTextChannel(guild, ch, dry);
    else if (ch.type === 'voice') await ensureVoiceChannel(guild, ch, dry);
  }
}

async function pruneExtraneous(guild: Guild, cfg: GuildConfig, dry?: boolean) {
  if (!cfg.pruneExtraneous) return;
  // Roles
  const desiredRoles = new Set((cfg.roles ?? []).map((r) => r.name.toLowerCase()));
  for (const role of guild.roles.cache.values()) {
    if (role.name === '@everyone') continue;
    if (!desiredRoles.has(role.name.toLowerCase())) {
      logAction(dry, `Delete role not in config: ${role.name}`);
      if (!dry) await role.delete('prune (not in config)');
    }
  }
  // Channels (exclude threads)
  const desiredChannels = new Set(
    (cfg.channels ?? [])
      .flatMap((c) => (c.type === 'category' ? [c.name, ...(c.channels ?? []).map((x) => x.name)] : [c.name]))
      .map((n) => n.toLowerCase())
  );
  for (const ch of guild.channels.cache.values()) {
    if (
      (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildCategory) &&
      !desiredChannels.has(ch.name.toLowerCase())
    ) {
      logAction(dry, `Delete channel not in config: ${ch.name}`);
      if (!dry) await (ch as any).delete('prune (not in config)');
    }
  }
}

export async function syncGuild({ token, guildId, config, dryRun }: SyncOptions) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`Connected to guild: ${guild.name} (${guild.id})`);
    if (config.name && config.name !== guild.name) {
      logAction(dryRun, `Update guild name: ${guild.name} -> ${config.name}`);
      if (!dryRun) await guild.edit({ name: config.name });
    }
    await ensureRoles(guild, config.roles, dryRun);
    await ensureChannels(guild, config.channels, dryRun);
    await pruneExtraneous(guild, config, dryRun);
  } finally {
    client.destroy();
  }
}

