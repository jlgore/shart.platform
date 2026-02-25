import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { PermissionFlagsBits } from 'discord.js';
import type {
  AnyChannelConfig,
  CategoryChannelConfig,
  EventConfig,
  EventEntityType,
  GuildConfig,
  RoleConfig,
  TextChannelConfig,
  VoiceChannelConfig,
} from './types.js';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function ensureString(x: unknown, field: string): string | undefined {
  if (x === undefined) return undefined;
  if (typeof x !== 'string') throw new Error(`Invalid ${field}: expected string`);
  return x;
}

function ensureBoolean(x: unknown, field: string): boolean | undefined {
  if (x === undefined) return undefined;
  if (typeof x !== 'boolean') throw new Error(`Invalid ${field}: expected boolean`);
  return x;
}

function ensureNumber(x: unknown, field: string): number | undefined {
  if (x === undefined) return undefined;
  if (typeof x !== 'number') throw new Error(`Invalid ${field}: expected number`);
  return x;
}

function ensureDateString(x: unknown, field: string): string | undefined {
  if (x === undefined) return undefined;
  if (typeof x !== 'string') throw new Error(`Invalid ${field}: expected ISO date string`);
  const parsed = Date.parse(x);
  if (Number.isNaN(parsed)) throw new Error(`Invalid ${field}: could not parse date`);
  return x;
}

function ensureEventEntityType(x: unknown, field: string): EventEntityType | undefined {
  if (x === undefined) return undefined;
  const value = ensureString(x, field);
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'voice' || normalized === 'stage' || normalized === 'external') {
    return normalized as EventEntityType;
  }
  throw new Error(`Invalid ${field}: expected voice | stage | external`);
}

function ensureStringArray(x: unknown, field: string): string[] | undefined {
  if (x === undefined) return undefined;
  if (!Array.isArray(x) || x.some((v) => typeof v !== 'string')) {
    throw new Error(`Invalid ${field}: expected array of strings`);
  }
  return x as string[];
}

const permissionNames = new Set(Object.keys(PermissionFlagsBits));

function ensurePermissionArray(x: unknown, field: string) {
  const list = ensureStringArray(x, field);
  if (!list) return undefined;
  const invalid = list.filter((name) => !permissionNames.has(name));
  if (invalid.length) {
    throw new Error(`Invalid ${field}: unknown permission(s): ${invalid.join(', ')}`);
  }
  return list as any;
}

function parseRole(input: any): RoleConfig {
  if (!isObject(input)) throw new Error('Role must be an object');
  const name = ensureString(input.name, 'role.name');
  if (!name) throw new Error('role.name is required');
  return {
    name,
    color: ensureString(input.color, 'role.color'),
    hoist: ensureBoolean(input.hoist, 'role.hoist'),
    mentionable: ensureBoolean(input.mentionable, 'role.mentionable'),
    permissions: ensurePermissionArray(input.permissions, 'role.permissions'),
    position: ensureNumber(input.position, 'role.position'),
  };
}

function parseOverwrites(input: any, ctx: string) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new Error(`Invalid ${ctx}.overwrites: expected array`);
  return input.map((ov, i) => {
    if (!isObject(ov)) throw new Error(`Invalid ${ctx}.overwrites[${i}]: expected object`);
    const role = ensureString(ov.role, `${ctx}.overwrites[${i}].role`);
    if (!role) throw new Error(`${ctx}.overwrites[${i}].role is required`);
    return {
      role,
      allow: ensurePermissionArray(ov.allow, `${ctx}.overwrites[${i}].allow`),
      deny: ensurePermissionArray(ov.deny, `${ctx}.overwrites[${i}].deny`),
    };
  });
}

function parseTextChannel(input: any): TextChannelConfig {
  if (!isObject(input)) throw new Error('Text channel must be an object');
  const name = ensureString(input.name, 'channel.name');
  if (!name) throw new Error('channel.name is required');
  return {
    type: 'text',
    name,
    topic: ensureString(input.topic, 'channel.topic'),
    nsfw: ensureBoolean(input.nsfw, 'channel.nsfw'),
    rateLimitPerUser: ensureNumber(input.rateLimitPerUser, 'channel.rateLimitPerUser'),
    position: ensureNumber(input.position, 'channel.position'),
    parent: ensureString(input.parent, 'channel.parent'),
    overwrites: parseOverwrites(input.overwrites, `channel(${name})`),
  };
}

function parseVoiceChannel(input: any): VoiceChannelConfig {
  if (!isObject(input)) throw new Error('Voice channel must be an object');
  const name = ensureString(input.name, 'channel.name');
  if (!name) throw new Error('channel.name is required');
  return {
    type: 'voice',
    name,
    bitrate: ensureNumber(input.bitrate, 'channel.bitrate'),
    userLimit: ensureNumber(input.userLimit, 'channel.userLimit'),
    position: ensureNumber(input.position, 'channel.position'),
    parent: ensureString(input.parent, 'channel.parent'),
    overwrites: parseOverwrites(input.overwrites, `channel(${name})`),
  };
}

function parseCategory(input: any): CategoryChannelConfig {
  if (!isObject(input)) throw new Error('Category must be an object');
  const name = ensureString(input.name, 'category.name');
  if (!name) throw new Error('category.name is required');
  const base: CategoryChannelConfig = {
    type: 'category',
    name,
    position: ensureNumber(input.position, 'category.position'),
    overwrites: parseOverwrites(input.overwrites, `category(${name})`),
    channels: [],
  };
  if (input.channels !== undefined) {
    if (!Array.isArray(input.channels)) throw new Error('category.channels must be an array');
    base.channels = input.channels.map((c: any) => {
      const type = ensureString(c.type, 'channel.type');
      if (type === 'text') return parseTextChannel(c);
      if (type === 'voice') return parseVoiceChannel(c);
      throw new Error(`Unsupported channel type in category(${name}): ${type}`);
    });
    // Ensure child channels inherit parent unless explicitly set
    base.channels = base.channels.map((c) => ({ ...c, parent: c.parent ?? name }));
  }
  return base;
}

function parseEvent(input: any): EventConfig {
  if (!isObject(input)) throw new Error('Event must be an object');
  const name = ensureString(input.name, 'event.name');
  if (!name) throw new Error('event.name is required');
  const entityType = ensureEventEntityType(input.entityType, 'event.entityType');
  if (!entityType) throw new Error('event.entityType is required');
  const startTime = ensureDateString(input.startTime, 'event.startTime');
  if (!startTime) throw new Error('event.startTime is required');

  const event: EventConfig = {
    name,
    description: ensureString(input.description, 'event.description'),
    startTime,
    endTime: ensureDateString(input.endTime, 'event.endTime'),
    entityType,
    channel: ensureString(input.channel, 'event.channel'),
    location: ensureString(input.location, 'event.location'),
  };

  if (entityType === 'external') {
    if (!event.location) throw new Error('event.location is required for external events');
    if (!event.endTime) throw new Error('event.endTime is required for external events');
    event.channel = undefined;
  } else {
    if (!event.channel) throw new Error('event.channel is required for voice/stage events');
    event.location = undefined;
  }

  return event;
}

function parseChannel(input: any): AnyChannelConfig {
  const type = ensureString(input.type, 'channel.type');
  if (!type) throw new Error('channel.type is required');
  if (type === 'text') return parseTextChannel(input);
  if (type === 'voice') return parseVoiceChannel(input);
  if (type === 'category') return parseCategory(input);
  throw new Error(`Unsupported channel type: ${type}`);
}

type LoadConfigOptions = {
  strict?: boolean;
};

type ChannelEntry = {
  type: 'text' | 'voice' | 'category';
  name: string;
  parent?: string;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function collectChannelEntries(channels: AnyChannelConfig[] | undefined): ChannelEntry[] {
  const entries: ChannelEntry[] = [];
  for (const ch of channels ?? []) {
    if (ch.type === 'category') {
      entries.push({ type: 'category', name: ch.name });
      for (const child of ch.channels ?? []) {
        entries.push({
          type: child.type,
          name: child.name,
          parent: child.parent ?? ch.name,
        });
      }
    } else {
      entries.push({ type: ch.type, name: ch.name, parent: ch.parent });
    }
  }
  return entries;
}

function runStrictChecks(cfg: GuildConfig) {
  const entries = collectChannelEntries(cfg.channels);
  const categoryNames = new Set<string>();
  const namesByParent = new Map<string, Set<string>>();
  const parentsByName = new Map<string, Set<string>>();
  const parentLabels = new Map<string, string>();
  const rootKey = '__root__';

  for (const entry of entries) {
    if (entry.type === 'category') {
      const key = normalizeKey(entry.name);
      if (categoryNames.has(key)) {
        throw new Error(`Duplicate category name (case-insensitive): ${entry.name}`);
      }
      categoryNames.add(key);
      continue;
    }

    const nameKey = normalizeKey(entry.name);
    const parentLabel = entry.parent ?? '(root)';
    const parentKey = entry.parent ? normalizeKey(entry.parent) : rootKey;
    if (!parentLabels.has(parentKey)) parentLabels.set(parentKey, parentLabel);

    const byParentKey = `${entry.type}:${parentKey}`;
    const existingNames = namesByParent.get(byParentKey) ?? new Set<string>();
    if (existingNames.has(nameKey)) {
      throw new Error(
        `Duplicate ${entry.type} channel name "${entry.name}" under parent "${parentLabel}"`
      );
    }
    existingNames.add(nameKey);
    namesByParent.set(byParentKey, existingNames);

    const byNameKey = `${entry.type}:${nameKey}`;
    const parents = parentsByName.get(byNameKey) ?? new Set<string>();
    parents.add(parentKey);
    parentsByName.set(byNameKey, parents);
    if (parents.size > 1) {
      const labels = Array.from(parents).map((key) => parentLabels.get(key) ?? key);
      throw new Error(
        `Ambiguous ${entry.type} channel name "${entry.name}" across parents: ${labels.join(', ')}`
      );
    }
  }

  const eventNames = new Set<string>();
  for (const ev of cfg.events ?? []) {
    const key = normalizeKey(ev.name);
    if (eventNames.has(key)) {
      throw new Error(`Duplicate event name (case-insensitive): ${ev.name}`);
    }
    eventNames.add(key);
  }
}

export async function loadConfig(
  configPath: string,
  options: LoadConfigOptions = {}
): Promise<GuildConfig> {
  const full = path.resolve(configPath);
  const raw = await fs.readFile(full, 'utf8');
  const data = YAML.parse(raw);
  if (!isObject(data)) throw new Error('Config root must be an object');
  const roles = Array.isArray((data as any).roles)
    ? (data as any).roles.map(parseRole)
    : undefined;
  const channels = Array.isArray((data as any).channels)
    ? (data as any).channels.map(parseChannel)
    : undefined;
  const events = Array.isArray((data as any).events)
    ? (data as any).events.map(parseEvent)
    : undefined;
  const cfg: GuildConfig = {
    name: ensureString((data as any).name, 'name'),
    pruneExtraneous: ensureBoolean((data as any).pruneExtraneous, 'pruneExtraneous') ?? false,
    roles,
    channels,
    events,
  };
  if (options.strict) runStrictChecks(cfg);
  return cfg;
}
