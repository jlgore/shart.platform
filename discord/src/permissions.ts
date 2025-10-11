import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import type { PermissionName } from './types.js';

export function resolvePermissions(names?: PermissionName[] | null) {
  if (!names || names.length === 0) return PermissionsBitField.DefaultBit;
  try {
    return PermissionsBitField.resolve(names as any);
  } catch {
    // Fallback: manual map in case of mismatch
    const bits = names.map((n) => (PermissionFlagsBits as any)[n] ?? 0n);
    return new PermissionsBitField(bits as any).bitfield;
  }
}

