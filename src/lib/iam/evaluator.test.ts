import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  tryParsePolicy,
  type PolicyDocument,
  type Principal,
  type Resource,
} from './evaluator';

const principals: Principal[] = [
  { id: 'jane', name: 'Jane', type: 'user' },
  { id: 'captain', name: 'Captain', type: 'user' },
];

const resources: Resource[] = [
  { id: 'spaces:public', name: 'Spaces Public' },
  { id: 'db:prod-main', name: 'Prod DB' },
];

describe('tryParsePolicy', () => {
  it('parses valid policy', () => {
    const { policy, error } = tryParsePolicy(JSON.stringify({ Statement: [] }));
    expect(error).toBeUndefined();
    expect(policy).not.toBeNull();
  });

  it('rejects invalid shape', () => {
    const { policy, error } = tryParsePolicy('{}');
    expect(policy).toBeNull();
    expect(error).toMatch(/Statement/i);
  });
});

describe('evaluatePolicy', () => {
  it('allows when action/resource match', () => {
    const policy: PolicyDocument = {
      Statement: [{ Effect: 'Allow', Action: 'spaces:GetObject', Resource: 'spaces:public' }],
    };
    const res = evaluatePolicy(principals, resources, policy);
    const jane = res.find((r) => r.principal.id === 'jane')!;
    expect(
      jane.results.some((x) => x.outcome === 'allow' && x.action === 'spaces:GetObject' && x.resourceId === 'spaces:public')
    ).toBe(true);
  });

  it('supports wildcards (case-insensitive)', () => {
    const policy: PolicyDocument = {
      Statement: [{ Effect: 'Allow', Action: 'SPACES:*', Resource: 'spaces:*' }],
    };
    const res = evaluatePolicy(principals, resources, policy);
    const any = res.flatMap((p) => p.results);
    expect(any.some((x) => x.action.startsWith('SPACES:') || x.action.startsWith('spaces:'))).toBe(true);
  });

  it('explicit Deny beats Allow regardless of order', () => {
    const policy1: PolicyDocument = {
      Statement: [
        { Effect: 'Allow', Action: 'db:*', Resource: 'db:prod-*' },
        { Effect: 'Deny', Action: 'db:*', Resource: 'db:prod-main' },
      ],
    };
    const policy2: PolicyDocument = {
      Statement: [
        { Effect: 'Deny', Action: 'db:*', Resource: 'db:prod-main' },
        { Effect: 'Allow', Action: 'db:*', Resource: 'db:prod-*' },
      ],
    };

    for (const policy of [policy1, policy2]) {
      const res = evaluatePolicy(principals, resources, policy);
      const anyDeny = res
        .flatMap((p) => p.results)
        .some((r) => r.resourceId === 'db:prod-main' && r.outcome === 'deny' && r.action === 'db:*');
      expect(anyDeny).toBe(true);
    }
  });

  it('principal scoping applies only to listed principals', () => {
    const policy: PolicyDocument = {
      Statement: [{ Effect: 'Allow', Action: 'spaces:GetObject', Resource: 'spaces:public', Principal: 'jane' }],
    };
    const res = evaluatePolicy(principals, resources, policy);
    const jane = res.find((r) => r.principal.id === 'jane')!;
    const captain = res.find((r) => r.principal.id === 'captain')!;
    expect(jane.results.some((r) => r.outcome === 'allow')).toBe(true);
    expect(captain.results.length).toBe(0);
  });

  it('omits tuples with no matching statements (no implicit entries)', () => {
    const policy: PolicyDocument = { Statement: [] };
    const res = evaluatePolicy(principals, resources, policy);
    expect(res.every((p) => p.results.length === 0)).toBe(true);
  });

  it('results sorted: allows first then denies, by resource then action', () => {
    const policy: PolicyDocument = {
      Statement: [
        { Effect: 'Deny', Action: 'spaces:GetObject', Resource: 'spaces:public' },
        { Effect: 'Allow', Action: 'spaces:ListBucket', Resource: 'spaces:public' },
      ],
    };
    const res = evaluatePolicy(principals, resources, policy);
    const jane = res.find((r) => r.principal.id === 'jane')!;
    const outcomes = jane.results.map((r) => r.outcome);
    // allows come first, then denies
    expect(outcomes.join(',')).toMatch(/allow.*deny|^$|^allow$/);
  });
});

