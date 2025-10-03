export type Effect = 'Allow' | 'Deny';

export interface PolicyStatement {
  Effect: Effect;
  Action: string | string[];
  Resource: string | string[];
  // Optional principal scoping for simplicity: ids or "*" (all)
  Principal?: string | string[];
}

export interface PolicyDocument {
  Version?: string;
  Statement: PolicyStatement[];
}

export interface Principal {
  id: string;
  name: string;
  type: 'user' | 'role' | 'group';
  role?: string;
}

export interface Resource {
  id: string; // e.g., "spaces:nimbus-public-assets"
  name: string; // human label
  service?: string; // e.g., "spaces", "droplet"
}

export interface EvaluationResultItem {
  principalId: string;
  principalName: string;
  resourceId: string;
  resourceName: string;
  action: string;
  outcome: 'allow' | 'deny';
  reason: string; // e.g., "Matched Deny at statement #2"
  statementIndex: number; // 0-based index
}

export interface EvaluationResultByPrincipal {
  principal: Principal;
  results: EvaluationResultItem[]; // flattened list of allow/deny results
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// Simple glob match: supports '*' wildcard, case-insensitive
function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  // Escape regex special chars except '*'
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(value);
}

function actionMatches(spec: string, action: string): boolean {
  return globMatch(spec, action);
}

function resourceMatches(spec: string, resourceId: string): boolean {
  return globMatch(spec, resourceId);
}

function principalMatches(spec: string | undefined, principalId: string): boolean {
  if (!spec || spec === '*') return true;
  return globMatch(spec, principalId);
}

export function evaluatePolicy(
  principals: Principal[],
  resources: Resource[],
  policy: PolicyDocument
): EvaluationResultByPrincipal[] {
  // Collect unique actions declared anywhere in the policy
  const declaredActions = new Set<string>();
  policy.Statement.forEach((st) => {
    toArray(st.Action).forEach((a) => declaredActions.add(a));
  });

  const allActions = Array.from(declaredActions);

  const resultsByPrincipal: EvaluationResultByPrincipal[] = principals.map((p) => ({
    principal: p,
    results: [],
  }));

  for (const p of principals) {
    for (const r of resources) {
      for (const action of allActions) {
        // Find matching statements for this (p, r, action)
        const matches = policy.Statement
          .map((st, idx) => ({ st, idx }))
          .filter(({ st }) => {
            const principalSpec = st.Principal;
            const principalOk =
              principalSpec === undefined
                ? true
                : Array.isArray(principalSpec)
                ? principalSpec.some((s) => principalMatches(s, p.id))
                : principalMatches(principalSpec, p.id);

            if (!principalOk) return false;

            const actionOk = toArray(st.Action).some((a) => actionMatches(a, action));
            if (!actionOk) return false;

            const resourceOk = toArray(st.Resource).some((res) => resourceMatches(res, r.id));
            return resourceOk;
          });

        if (matches.length === 0) {
          // No opinion for this tuple; we don't list implicit no-access in MVP
          continue;
        }

        // Precedence: any Deny wins; else if any Allow then allow
        const deny = matches.find(({ st }) => st.Effect === 'Deny');
        const allow = matches.find(({ st }) => st.Effect === 'Allow');

        if (deny) {
          resultsByPrincipal
            .find((x) => x.principal.id === p.id)!
            .results.push({
              principalId: p.id,
              principalName: p.name,
              resourceId: r.id,
              resourceName: r.name,
              action,
              outcome: 'deny',
              reason: `Matched Deny at statement #${deny.idx + 1}`,
              statementIndex: deny.idx,
            });
          continue;
        }

        if (allow) {
          resultsByPrincipal
            .find((x) => x.principal.id === p.id)!
            .results.push({
              principalId: p.id,
              principalName: p.name,
              resourceId: r.id,
              resourceName: r.name,
              action,
              outcome: 'allow',
              reason: `Matched Allow at statement #${allow.idx + 1}`,
              statementIndex: allow.idx,
            });
          continue;
        }
      }
    }
  }

  // Sort results for readability: allow first, then deny; then by action
  resultsByPrincipal.forEach((grp) => {
    grp.results.sort((a, b) => {
      if (a.outcome !== b.outcome) return a.outcome === 'allow' ? -1 : 1;
      if (a.resourceName !== b.resourceName) return a.resourceName.localeCompare(b.resourceName);
      return a.action.localeCompare(b.action);
    });
  });

  return resultsByPrincipal;
}

export function tryParsePolicy(jsonText: string): { policy: PolicyDocument | null; error?: string } {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.Statement)) {
      return { policy: null, error: 'Invalid policy: must contain Statement[]' };
    }
    return { policy: parsed as PolicyDocument };
  } catch (e: any) {
    return { policy: null, error: e?.message || 'Failed to parse policy JSON' };
  }
}

