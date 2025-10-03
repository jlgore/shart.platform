import React, { useMemo, useState } from 'react';
import type { PolicyDocument, Principal, Resource } from '../../lib/iam/evaluator';
import { evaluatePolicy, tryParsePolicy } from '../../lib/iam/evaluator';

const initialPrincipals: Principal[] = [
  { id: 'jane-sre', name: 'Jane', type: 'user', role: 'Site Reliability Engineer' },
  { id: 'captain-intern', name: 'Captain', type: 'user', role: 'Software Intern' },
  { id: 'mira-dba', name: 'Mira', type: 'user', role: 'Database Administrator' },
  { id: 'omar-support', name: 'Omar', type: 'user', role: 'Support Engineer' },
  { id: 'admin-role', name: 'AdminRole', type: 'role', role: 'Cloud Admin' },
];

const initialResources: Resource[] = [
  { id: 'spaces:nimbus-public-assets', name: 'Object Storage: public-assets', service: 'spaces' },
  { id: 'spaces:nimbus-confidential', name: 'Object Storage: prod-confidential', service: 'spaces' },
  { id: 'droplet:web-01', name: 'Compute: web-01', service: 'droplet' },
  { id: 'db:prod-main', name: 'Managed DB: prod-main', service: 'db' },
  { id: 'k8s:prod-cluster', name: 'Kubernetes: prod-cluster', service: 'k8s' },
];

const initialPolicy: PolicyDocument = {
  Version: '2025-01-01',
  Statement: [
    {
      Effect: 'Allow',
      Action: ['spaces:GetObject', 'spaces:ListBucket'],
      Resource: ['spaces:nimbus-public-assets', 'spaces:nimbus-public-assets/*'],
      Principal: ['jane-sre', 'omar-support', 'captain-intern'],
    },
    {
      Effect: 'Deny',
      Action: ['spaces:*'],
      Resource: ['spaces:nimbus-confidential', 'spaces:nimbus-confidential/*'],
      Principal: ['captain-intern'],
    },
    {
      Effect: 'Allow',
      Action: ['db:Query'],
      Resource: ['db:prod-main'],
      Principal: ['mira-dba'],
    },
    {
      Effect: 'Deny',
      Action: ['db:*'],
      Resource: ['db:prod-main'],
      Principal: ['captain-intern'],
    },
    {
      Effect: 'Allow',
      Action: ['droplet:Reboot'],
      Resource: ['droplet:web-01'],
      Principal: ['admin-role', 'jane-sre'],
    },
    {
      Effect: 'Allow',
      Action: ['k8s:Deploy'],
      Resource: ['k8s:prod-cluster'],
      Principal: ['jane-sre'],
    },
  ],
};

const pretty = (obj: unknown) => JSON.stringify(obj, null, 2);

export default function IAMPolicyExplainer() {
  const [policyText, setPolicyText] = useState(pretty(initialPolicy));
  const [showAllows, setShowAllows] = useState(true);
  const [showDenies, setShowDenies] = useState(true);
  const [showWhy, setShowWhy] = useState(true);

  const { policy, error } = useMemo(() => tryParsePolicy(policyText), [policyText]);

  const evaluation = useMemo(() => {
    if (!policy) return [];
    return evaluatePolicy(initialPrincipals, initialResources, policy);
  }, [policy]);

  const totalAllows = useMemo(
    () => evaluation.reduce((acc, p) => acc + p.results.filter((r) => r.outcome === 'allow').length, 0),
    [evaluation]
  );
  const totalDenies = useMemo(
    () => evaluation.reduce((acc, p) => acc + p.results.filter((r) => r.outcome === 'deny').length, 0),
    [evaluation]
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-black/40 text-zinc-100">
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-sm uppercase tracking-wide text-zinc-400">IAM Explainer (human language)</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
        <div className="p-4">
          <div className="mb-2 text-sm text-zinc-400">Edit policy JSON</div>
          <textarea
            value={policyText}
            onChange={(e) => setPolicyText(e.target.value)}
            className="w-full h-80 font-mono text-sm rounded-md bg-black/60 border border-zinc-800 p-3 focus:outline-none focus:ring-2 focus:ring-green-600"
            spellCheck={false}
          />
          {error && <div className="mt-2 text-xs text-red-400">Parse error: {error}</div>}
          <div className="mt-3 text-xs text-zinc-400">
            Tip: use wildcards like <code className="text-zinc-300">spaces:*</code> or <code className="text-zinc-300">db:prod-*</code>, and optional
            <code className="text-zinc-300"> Principal</code> to scope to users by id.
          </div>
        </div>
        <div className="p-4">
          <div className="mb-2 text-sm text-zinc-400">Scenario: NimbusCloud (DigitalOcean/Linode vibes)</div>
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase text-zinc-500 mb-1">Principals</div>
              <ul className="text-sm list-disc pl-5">
                {initialPrincipals.map((p) => (
                  <li key={p.id}>
                    <span className="text-zinc-100">{p.name}</span>
                    <span className="text-zinc-400"> — {p.role} ({p.type})</span>
                    <span className="ml-2 text-zinc-500">id: {p.id}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase text-zinc-500 mb-1">Resources</div>
              <ul className="text-sm list-disc pl-5">
                {initialResources.map((r) => (
                  <li key={r.id}>
                    <span className="text-zinc-100">{r.name}</span>
                    <span className="text-zinc-500 ml-2">id: {r.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-zinc-200">Results</div>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showAllows} onChange={() => setShowAllows((v) => !v)} />
              <span className="text-green-400">show allows ({totalAllows})</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showDenies} onChange={() => setShowDenies((v) => !v)} />
              <span className="text-red-400">show denies ({totalDenies})</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showWhy} onChange={() => setShowWhy((v) => !v)} />
              <span className="text-zinc-300">why</span>
            </label>
          </div>
        </div>

        {!policy ? (
          <div className="text-sm text-zinc-400">Enter valid policy JSON to see results.</div>
        ) : (
          <div className="space-y-6">
            {evaluation.map((group) => {
              const lines = group.results.filter((r) => (r.outcome === 'allow' ? showAllows : showDenies));
              if (lines.length === 0) return null;
              return (
                <div key={group.principal.id}>
                  <div className="mb-2 font-semibold text-zinc-200">{group.principal.name}</div>
                  <ul className="space-y-1">
                    {lines.map((r, idx) => (
                      <li key={idx} className="text-sm">
                        {r.outcome === 'allow' ? (
                          <span className="text-green-400">can</span>
                        ) : (
                          <span className="text-red-400">cannot</span>
                        )}{' '}
                        <span className="text-zinc-100">{r.action}</span>
                        <span className="text-zinc-400"> on </span>
                        <span className="text-zinc-100">{r.resourceName}</span>
                        {showWhy && <span className="text-zinc-500"> — {r.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {evaluation.every((g) => g.results.length === 0) && (
              <div className="text-sm text-zinc-400">No matching statements for any principal/resource/action.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
