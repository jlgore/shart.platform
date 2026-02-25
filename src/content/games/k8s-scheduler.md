---
title: "Kubernetes Scheduler"
description: "You are the kube-scheduler. Drag pods onto the right worker nodes based on resources, selectors, taints, and affinities. Endless rounds with scaling difficulty."
gameId: "k8s-scheduler"
category: "kubernetes"
difficulty: "intermediate"
estimatedTime: 15
learningObjectives:
  - "Understand how kube-scheduler fits pods by CPU and memory requests"
  - "Use nodeSelector to pin pods to labeled nodes"
  - "Apply taints and tolerations to control scheduling"
  - "Configure pod affinity and anti-affinity rules"
  - "Schedule under resource pressure with all rules combined"
---

Master Kubernetes scheduling by dragging pods onto worker nodes. Each round introduces real kube-scheduler filter plugins — resources, selectors, taints, and affinities. Difficulty scales endlessly. Wrong placements cost lives but teach you exactly what went wrong and why.
