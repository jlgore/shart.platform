export type PermissionName = keyof typeof import('discord.js').PermissionFlagsBits;

export interface RoleConfig {
  name: string;
  color?: string; // HEX like #ff00aa or decimal color
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: PermissionName[];
  position?: number; // lower is near bottom
}

export interface OverwriteConfig {
  role: string; // role name, or id:<id>
  allow?: PermissionName[];
  deny?: PermissionName[];
}

export interface BaseChannelConfig {
  name: string;
  position?: number;
  parent?: string; // category name (or id:<id>)
  overwrites?: OverwriteConfig[];
}

export interface TextChannelConfig extends BaseChannelConfig {
  type: 'text';
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number; // slowmode in seconds
}

export interface VoiceChannelConfig extends BaseChannelConfig {
  type: 'voice';
  bitrate?: number; // in bps
  userLimit?: number; // 0 = unlimited
}

export type EventEntityType = 'voice' | 'stage' | 'external';

export interface EventConfig {
  name: string;
  description?: string;
  startTime: string; // ISO string
  endTime?: string; // required for external
  entityType: EventEntityType;
  channel?: string; // role-like ref: name or id:<id> (voice/stage)
  location?: string; // required for external
}

export interface CategoryChannelConfig extends BaseChannelConfig {
  type: 'category';
  channels?: Array<TextChannelConfig | VoiceChannelConfig>;
}

export type AnyChannelConfig =
  | TextChannelConfig
  | VoiceChannelConfig
  | CategoryChannelConfig;

export interface GuildConfig {
  name?: string;
  pruneExtraneous?: boolean; // delete roles/channels not in config
  roles?: RoleConfig[];
  channels?: AnyChannelConfig[];
  events?: EventConfig[];
}
