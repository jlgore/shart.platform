import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type {
  AnyChannelConfig,
  CategoryChannelConfig,
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

function ensureStringArray(x: unknown, field: string): string[] | undefined {
  if (x === undefined) return undefined;
  if (!Array.isArray(x) || x.some((v) => typeof v !== 'string')) {
    throw new Error(`Invalid ${field}: expected array of strings`);
  }
  return x as string[];
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
    permissions: ensureStringArray(input.permissions, 'role.permissions') as any,
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
      allow: ensureStringArray(ov.allow, `${ctx}.overwrites[${i}].allow`) as any,
      deny: ensureStringArray(ov.deny, `${ctx}.overwrites[${i}].deny`) as any,
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

function parseChannel(input: any): AnyChannelConfig {
  const type = ensureString(input.type, 'channel.type');
  if (!type) throw new Error('channel.type is required');
  if (type === 'text') return parseTextChannel(input);
  if (type === 'voice') return parseVoiceChannel(input);
  if (type === 'category') return parseCategory(input);
  throw new Error(`Unsupported channel type: ${type}`);
}

export async function loadConfig(configPath: string): Promise<GuildConfig> {
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
  const cfg: GuildConfig = {
    name: ensureString((data as any).name, 'name'),
    pruneExtraneous: ensureBoolean((data as any).pruneExtraneous, 'pruneExtraneous') ?? false,
    roles,
    channels,
  };
  return cfg;
}

