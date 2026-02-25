---
title: "Admission Policy Bouncer"
description: "You are the admission controller. Pods arrive at the door with their security specs — swipe right to admit, swipe left to deny, based on the active policy. Eight levels covering privileged containers, host namespaces, non-root enforcement, capabilities, image registries, resource limits, privilege escalation, and the full PSA restricted profile."
gameId: "k8s-admission-bouncer"
category: "kubernetes"
difficulty: "intermediate"
totalLevels: 8
estimatedTime: 20
learningObjectives:
  - "Identify privileged containers and understand why they are dangerous"
  - "Recognize host namespace misuse (hostPID, hostIPC, hostNetwork)"
  - "Apply non-root user enforcement via runAsNonRoot and runAsUser"
  - "Understand Linux capability restrictions and the drop:ALL pattern"
  - "Enforce image registry and tag policies for supply chain security"
  - "Require resource limits to prevent noisy neighbor problems"
  - "Spot missing allowPrivilegeEscalation: false configurations"
  - "Apply all rules together under the Kubernetes PSA Restricted profile"
---

You are the admission controller bouncer. Corporate security has issued the policy. Pods arrive one by one — read their spec, check it against the active rules, and make the call.

Swipe right (or press `→`) to **ADMIT**. Swipe left (or press `←`) to **DENY**. Wrong calls cost a life and always teach you the exact rule that was violated.

Eight levels escalate from single-rule checks up to the full Kubernetes Pod Security Admission **Restricted** profile — the same rules enforced in production clusters at regulated organizations.
