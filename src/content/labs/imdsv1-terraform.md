---
title: "IMDSv1 to IMDSv2 Migration Lab"
description: "Learn how to identify and migrate EC2 instances from IMDSv1 to IMDSv2 using Terraform and security best practices."
category: "cloud-security"
difficulty: "intermediate"
tags: ["aws", "ec2", "imds", "security", "terraform"]
githubRepo: "shart-cloud/lab-imdsv1-terraform"
branchPattern: "branch-{step}-*"
estimatedTime: 60
prerequisites: ["AWS Account", "Terraform installed", "Basic EC2 knowledge"]
learningObjectives: [
  "Understand IMDS security implications",
  "Identify IMDSv1 usage in your environment",
  "Migrate instances to IMDSv2 using Terraform",
  "Implement monitoring for IMDS compliance"
]
publishedDate: 2025-10-08
isActive: true
draft: false
---

# IMDSv1 to IMDSv2 Migration Lab

This lab will guide you through identifying and migrating EC2 instances from the less secure IMDSv1 to the more secure IMDSv2 using Terraform automation and security best practices.

## Overview

The EC2 Instance Metadata Service (IMDS) provides access to instance metadata from within EC2 instances. IMDSv2 introduces important security improvements over IMDSv1, including session-oriented requests and additional protection against certain types of attacks.

## What You'll Learn

- Understanding the security differences between IMDSv1 and IMDSv2
- Identifying instances currently using IMDSv1
- Using Terraform to enforce IMDSv2 requirements
- Monitoring and compliance strategies

## Prerequisites

Before starting this lab, ensure you have:
- An active AWS account
- Terraform installed and configured
- Basic understanding of EC2 and AWS CLI
- Understanding of infrastructure as code concepts

## Lab Structure

This lab is divided into progressive steps, each building on the previous one. Each step has its own branch in the GitHub repository, allowing you to follow along with the exact code and configuration needed.

## Getting Started

To begin this lab, clone the repository and check out the first step:

```bash
git clone https://github.com/shart-cloud/lab-imdsv1-terraform.git
cd lab-imdsv1-terraform
git checkout branch-1-vulnerable
```

Ready to begin? Let's start with Step 1!