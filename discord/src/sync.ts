import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Guild,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  Role,
} from 'discord.js';
import type { GuildBasedChannel } from 'discord.js';
import type {
  AnyChannelConfig,
  CategoryChannelConfig,
  EventConfig,
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

function resolveRoleColor(color: string): string | number {
  if (/^\d+$/.test(color)) return Number(color);
  return color;
}

function parseDate(value: string, label: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return d;
}

function mapEventEntityType(type: 'voice' | 'stage' | 'external') {
  if (type === 'external') return GuildScheduledEventEntityType.External;
  if (type === 'stage') return GuildScheduledEventEntityType.StageInstance;
  return GuildScheduledEventEntityType.Voice;
}

function resolveChannelIdForEvent(
  guild: Guild,
  ref: string,
  allowedTypes: ChannelType[]
) {
  if (ref.startsWith('id:')) {
    const id = ref.slice(3);
    const ch = guild.channels.cache.get(id);
    if (ch && allowedTypes.includes(ch.type as ChannelType)) return id;
    return undefined;
  }
  const ch = guild.channels.cache.find(
    (c) => allowedTypes.includes(c.type as ChannelType) && c.name.toLowerCase() === ref.toLowerCase()
  );
  return ch?.id;
}

function formatPermissionNames(perms: Array<keyof typeof PermissionFlagsBits>) {
  return perms.join(', ');
}

async function ensureBotPermissions(guild: Guild, config: GuildConfig) {
  const me = await guild.members.fetchMe();

  const required: Array<keyof typeof PermissionFlagsBits> = ['ManageRoles', 'ManageChannels'];
  if (config.name && config.name !== guild.name) required.push('ManageGuild');
  if (config.events?.length) required.push('ManageEvents');
  if ((config.roles ?? []).some((r) => (r.permissions ?? []).includes('Administrator'))) {
    required.push('Administrator');
  }

  const missing = required.filter((perm) => !me.permissions.has(PermissionFlagsBits[perm]));
  if (missing.length) {
    throw new Error(
      `Bot is missing required guild permissions (${formatPermissionNames(missing)}). ` +
      'Invite the bot with Administrator (npm run invite) or grant these permissions to its role.'
    );
  }

  const highestPos = me.roles.highest?.position ?? 0;
  const tooHigh = (config.roles ?? []).filter(
    (r) => r.position !== undefined && r.position >= highestPos
  );
  if (tooHigh.length) {
    const list = tooHigh.map((r) => `${r.name} (position ${r.position})`).join(', ');
    throw new Error(
      `Bot's top role is position ${highestPos}; it cannot move roles to positions >= that. ` +
      `Raise the bot role higher or lower these role positions: ${list}.`
    );
  }
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
          color: rc.color as any,
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
    if (rc.color !== undefined) {
      const desiredColor = resolveRoleColor(rc.color);
      if (typeof desiredColor === 'number') {
        if ((found as any).color !== desiredColor) (updates as any).color = desiredColor;
      } else if (found.hexColor.toLowerCase() !== desiredColor.toLowerCase()) {
        (updates as any).color = desiredColor;
      }
    }
    if (rc.hoist !== undefined && rc.hoist !== found.hoist) (updates as any).hoist = rc.hoist;
    if (rc.mentionable !== undefined && rc.mentionable !== found.mentionable)
      (updates as any).mentionable = rc.mentionable;
    if (rc.permissions !== undefined) {
      const current = found.permissions.bitfield;
      if (current !== perms) (updates as any).permissions = perms;
    }

    if (Object.keys(updates).length) {
      logAction(dry, `Update role: ${rc.name}`);
      if (!dry) await found.edit({ ...(updates as any), reason: 'sync from config' });
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

function parentMatches(ch: GuildBasedChannel, parent?: string) {
  if (!parent) return !ch.parentId;
  if (parent.startsWith('id:')) return ch.parentId === parent.slice(3);
  return ch.parent?.name.toLowerCase() === parent.toLowerCase();
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

  if (cfg.position !== undefined && (existing as any).position !== cfg.position) {
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
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name.toLowerCase() === cfg.name.toLowerCase() &&
      parentMatches(c, cfg.parent)
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
  if (cfg.position !== undefined && (existing as any).position !== cfg.position) {
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
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildVoice &&
      c.name.toLowerCase() === cfg.name.toLowerCase() &&
      parentMatches(c, cfg.parent)
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
  if (cfg.position !== undefined && (existing as any).position !== cfg.position) {
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

type DesiredChannelRef = {
  type: 'text' | 'voice' | 'category';
  name: string;
  parent?: string;
};

function collectDesiredChannels(channels: AnyChannelConfig[] | undefined): DesiredChannelRef[] {
  const desired: DesiredChannelRef[] = [];
  for (const ch of channels ?? []) {
    if (ch.type === 'category') {
      desired.push({ type: 'category', name: ch.name });
      for (const child of ch.channels ?? []) {
        desired.push({
          type: child.type,
          name: child.name,
          parent: child.parent ?? ch.name,
        });
      }
    } else {
      desired.push({ type: ch.type, name: ch.name, parent: ch.parent });
    }
  }
  return desired;
}

function isDesiredChannel(ch: GuildBasedChannel, desired: DesiredChannelRef) {
  if (desired.type === 'category') {
    return ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === desired.name.toLowerCase();
  }
  if (desired.type === 'text') {
    return (
      ch.type === ChannelType.GuildText &&
      ch.name.toLowerCase() === desired.name.toLowerCase() &&
      parentMatches(ch, desired.parent)
    );
  }
  return (
    ch.type === ChannelType.GuildVoice &&
    ch.name.toLowerCase() === desired.name.toLowerCase() &&
    parentMatches(ch, desired.parent)
  );
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

async function ensureEvents(guild: Guild, events: EventConfig[] | undefined, dry?: boolean) {
  if (!events?.length) return;
  await guild.channels.fetch();
  await guild.scheduledEvents.fetch();
  const existing = byNameMap(guild.scheduledEvents.cache.values());

  for (const ev of events) {
    const entityType = mapEventEntityType(ev.entityType);
    const start = parseDate(ev.startTime, `event(${ev.name}).startTime`);
    const end = ev.endTime ? parseDate(ev.endTime, `event(${ev.name}).endTime`) : undefined;
    if (entityType === GuildScheduledEventEntityType.External && !end) {
      throw new Error(`event(${ev.name}).endTime is required for external events`);
    }

    let channelId: string | undefined;
    if (entityType !== GuildScheduledEventEntityType.External) {
      const allowed =
        entityType === GuildScheduledEventEntityType.StageInstance
          ? [ChannelType.GuildStageVoice]
          : [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
      channelId = ev.channel ? resolveChannelIdForEvent(guild, ev.channel, allowed) : undefined;
      if (!channelId) {
        const typeLabel =
          entityType === GuildScheduledEventEntityType.StageInstance ? 'stage' : 'voice/stage';
        throw new Error(`Cannot resolve ${typeLabel} channel "${ev.channel}" for event "${ev.name}"`);
      }
    }

    const current = existing.get(ev.name.toLowerCase());
    if (!current) {
      logAction(dry, `Create scheduled event: ${ev.name}`);
      if (!dry) {
        await guild.scheduledEvents.create(
          {
            name: ev.name,
            description: ev.description,
            scheduledStartTime: start,
            scheduledEndTime: entityType === GuildScheduledEventEntityType.External ? end : end,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType,
            channel: channelId,
            entityMetadata:
              entityType === GuildScheduledEventEntityType.External && ev.location
                ? { location: ev.location }
                : undefined,
          } as any
        );
      }
      continue;
    }

    if (current.entityType !== entityType) {
      throw new Error(
        `Existing event "${ev.name}" has type ${GuildScheduledEventEntityType[current.entityType]}, but config wants ${ev.entityType}. Delete it or match the type.`
      );
    }

    const updates: Record<string, any> = {};
    if (ev.description !== undefined && ev.description !== current.description) {
      updates.description = ev.description;
    }
    if (current.scheduledStartTimestamp !== start.getTime()) {
      updates.scheduledStartTime = start;
    }

    if (entityType === GuildScheduledEventEntityType.External) {
      if (end && current.scheduledEndTimestamp !== end.getTime()) {
        updates.scheduledEndTime = end;
      }
      const currentLocation = current.entityMetadata?.location;
      if (ev.location !== undefined && ev.location !== currentLocation) {
        updates.entityMetadata = { location: ev.location };
      }
    } else {
      if (end && (current.scheduledEndTimestamp ?? 0) !== end.getTime()) {
        updates.scheduledEndTime = end;
      }
      if (channelId && current.channelId !== channelId) {
        updates.channel = channelId;
      }
    }

    if (Object.keys(updates).length) {
      logAction(dry, `Update scheduled event: ${ev.name}`);
      if (!dry) await current.edit(updates as any);
    }
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
  const desiredChannels = collectDesiredChannels(cfg.channels);
  for (const ch of guild.channels.cache.values()) {
    if (
      (ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildVoice ||
        ch.type === ChannelType.GuildCategory) &&
      !desiredChannels.some((desired) => isDesiredChannel(ch, desired))
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
    const guildName = guild.name ?? '<unknown>';
    console.log(`Connected to guild: ${guildName} (${guild.id})`);
    await ensureBotPermissions(guild, config);
    if (config.name && config.name !== guild.name) {
      logAction(dryRun, `Update guild name: ${guild.name} -> ${config.name}`);
      if (!dryRun) await guild.edit({ name: config.name });
    }
    await ensureRoles(guild, config.roles, dryRun);
    await ensureChannels(guild, config.channels, dryRun);
    await ensureEvents(guild, config.events, dryRun);
    await pruneExtraneous(guild, config, dryRun);
  } finally {
    client.destroy();
  }
}
