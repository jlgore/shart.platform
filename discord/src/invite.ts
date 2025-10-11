export function buildInviteUrl(
  clientId: string,
  scopes: string[] = ['bot', 'applications.commands'],
  permissions?: bigint | number | string
) {
  const base = 'https://discord.com/api/oauth2/authorize';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(' '),
  });
  if (permissions !== undefined) params.set('permissions', permissions.toString());
  return `${base}?${params.toString()}`;
}

