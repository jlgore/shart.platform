---
title: "Terraform vs. Ansible: What to use, when to use it!"
description: "A detailed breakdown on infrastructure as code vs. configuration as code."
date: 2025-11-18
author: "Jared Gore"
category: "cloud-security"
tags: ["terraform", "ansible", "explainer"]
image: "tfvsansible.png" 
readTime: 10
draft: false
---

## Introduction

If you're getting into infrastructure automation, you've probably heard the age-old debate: "Should I use Terraform or Ansible?" The truth is, this is the wrong question. The real question is: "How do I use both tools effectively?"

In this post, we'll break down what each tool does best, common anti-patterns to avoid, and how to combine them for a complete infrastructure automation solution.

## The Core Philosophy: Declarative vs Procedural

Before diving into specifics, let's understand the fundamental difference in how these tools work:

**Terraform** is **declarative**. You describe your desired end state, and Terraform figures out how to get there. It's like telling a contractor, "I want a two-story house with four bedrooms" and letting them figure out the construction order.

**Ansible** is a **hybrid** (declarative syntax, procedural execution). You write tasks that execute in order. It's like giving step-by-step instructions: "First pour the foundation, then frame the walls, then install the roof."

## What Terraform Does Best

Terraform excels at **infrastructure provisioning**. If you're creating the underlying resources that applications run on, Terraform is your tool.

### Terraform's Sweet Spot:

- **Cloud resource provisioning**: VMs, databases, load balancers, VPCs, subnets
- **Infrastructure lifecycle management**: Create, update, and destroy resources
- **State management**: Keeps track of what exists and what changed
- **Dependency handling**: Automatically determines the right order to create resources
- **Multi-cloud orchestration**: Manage AWS, Azure, GCP, and on-prem from one tool
- **Infrastructure as Code**: Version control your infrastructure

### Example Use Case:
You need to spin up a production environment with:
- A VPC with public and private subnets
- An RDS database instance
- Three EC2 instances behind a load balancer
- Security groups and IAM roles

**This is Terraform territory.** It will create everything in the correct order, handle dependencies (like ensuring the VPC exists before creating subnets), and track the state of every resource.

## What Ansible Does Best

Ansible excels at **configuration management**. Once your infrastructure exists, Ansible configures it to do useful work.

### Ansible's Sweet Spot:

- **Software installation**: Install packages, dependencies, and tools
- **Application configuration**: Edit config files, set environment variables
- **OS-level management**: Users, permissions, services, firewall rules
- **Application deployment**: Deploy code, restart services, run migrations
- **Day-2 operations**: Patching, updates, maintenance tasks
- **Multi-step procedures**: Complex workflows that need to run in order

### Example Use Case:
You have EC2 instances (created by Terraform) that need to:
- Install Nginx, PostgreSQL client, and Node.js
- Configure Nginx with specific SSL certificates
- Deploy your application code
- Set up log rotation
- Create application user accounts

**This is Ansible territory.** It will connect to each server and configure it exactly how you need.

## The Anti-Patterns: What Not To Do

Understanding what each tool *shouldn't* do is just as important as knowing what they should do.

### Terraform Anti-Patterns (CAN Do, But SHOULDN'T)

#### ❌ Configuration Management via Provisioners

```hcl
# DON'T DO THIS
resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t2.micro"
  
  provisioner "remote-exec" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y nginx",
      "sudo systemctl start nginx"
    ]
  }
}
```

**Why this is bad:**
- **Breaks idempotency**: If the provisioner fails halfway through, Terraform can't recover cleanly
- **No drift detection**: Terraform won't know if someone manually changed Nginx's config
- **State management issues**: The provisioner state isn't tracked properly
- **Makes debugging harder**: Errors in provisioners are harder to troubleshoot than Ansible failures

#### What you SHOULD do instead:
Use Terraform to create the EC2 instance, then use Ansible to install and configure Nginx.

### Ansible Anti-Patterns (CAN Do, But SHOULDN'T)

#### ❌ Infrastructure Provisioning

```yaml
# DON'T DO THIS
- name: Create EC2 instance
  amazon.aws.ec2_instance:
    name: "web-server"
    instance_type: "t2.micro"
    image_id: "ami-12345678"
    vpc_subnet_id: "subnet-12345"
    security_group: "sg-12345"
```

**Why this is bad:**
- **No state management**: Ansible doesn't track what it created, so updates and deletions are manual
- **Manual dependency handling**: You have to figure out what order to create resources
- **No drift detection**: Ansible won't tell you if someone manually deleted your EC2 instance
- **Complex to maintain**: Managing infrastructure lifecycle in Ansible becomes unwieldy

#### What you SHOULD do instead:
Use Terraform to provision all cloud resources, then use Ansible for configuration.

## The Golden Pattern: Using Them Together

The most powerful approach combines both tools, playing to each one's strengths.

### Pattern 1: Terraform First, Then Ansible

This is the most common and recommended pattern:

1. **Terraform provisions infrastructure**
   - Creates VMs, networks, databases, load balancers
   - Outputs IP addresses and connection details
   
2. **Terraform triggers Ansible** (optional)
   - Uses `local-exec` provisioner to call Ansible
   - Or output inventory file for separate Ansible run
   
3. **Ansible configures infrastructure**
   - Installs software
   - Deploys applications
   - Manages configuration

```hcl
# terraform/main.tf
resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t2.micro"
  
  tags = {
    Name = "web-server"
  }
}

output "web_server_ip" {
  value = aws_instance.web.public_ip
}

# Generate Ansible inventory
resource "local_file" "ansible_inventory" {
  content = templatefile("inventory.tpl", {
    web_ip = aws_instance.web.public_ip
  })
  filename = "../ansible/inventory.ini"
}
```

```yaml
# ansible/playbook.yml
- name: Configure web server
  hosts: webservers
  become: yes
  tasks:
    - name: Install Nginx
      apt:
        name: nginx
        state: present
        
    - name: Start Nginx
      service:
        name: nginx
        state: started
        enabled: yes
```

### Pattern 2: Ansible Calls Terraform

Some teams prefer to orchestrate everything from Ansible:

```yaml
- name: Provision infrastructure with Terraform
  terraform:
    project_path: '../terraform/'
    state: present
  register: tf_output
  
- name: Configure the servers
  hosts: "{{ tf_output.outputs.web_server_ip.value }}"
  tasks:
    - name: Install application
      # ... configuration tasks
```

### Which Pattern Should You Use?

**Use Pattern 1 (Terraform → Ansible)** when:
- You want clear separation of concerns
- Multiple people manage infrastructure vs configuration
- You're using CI/CD pipelines (Terraform in one job, Ansible in another)

**Use Pattern 2 (Ansible calls Terraform)** when:
- You want a single entry point for all automation
- Your team is more Ansible-focused
- You want Ansible to orchestrate the entire workflow

## Real-World Workflow Example

Let's walk through a complete example of provisioning and configuring a simple web application stack:

### Step 1: Terraform Creates Infrastructure

```hcl
# Create VPC, subnets, security groups
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

# Create 3 web servers
resource "aws_instance" "web" {
  count         = 3
  ami           = "ami-12345678"
  instance_type = "t2.micro"
  subnet_id     = aws_subnet.private.id
  
  tags = {
    Name = "web-${count.index}"
    Role = "webserver"
  }
}

# Create RDS database
resource "aws_db_instance" "main" {
  identifier     = "myapp-db"
  engine         = "postgres"
  instance_class = "db.t3.micro"
}

# Create load balancer
resource "aws_lb" "main" {
  name               = "myapp-lb"
  load_balancer_type = "application"
}
```

### Step 2: Ansible Configures Everything

```yaml
- name: Configure web servers
  hosts: tag_Role_webserver
  become: yes
  tasks:
    - name: Install dependencies
      apt:
        name:
          - nginx
          - python3-pip
          - postgresql-client
        state: present
    
    - name: Deploy application
      git:
        repo: 'https://github.com/myorg/myapp.git'
        dest: /opt/myapp
        version: main
    
    - name: Install Python dependencies
      pip:
        requirements: /opt/myapp/requirements.txt
    
    - name: Configure application
      template:
        src: app_config.j2
        dest: /opt/myapp/config.yml
      notify: restart application
    
    - name: Configure Nginx
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/sites-available/myapp
      notify: restart nginx
  
  handlers:
    - name: restart nginx
      service:
        name: nginx
        state: restarted
    
    - name: restart application
      systemd:
        name: myapp
        state: restarted
```

## Common Questions

### "Can't I just use Terraform for everything?"

Technically, yes—but you'll regret it. Terraform provisioners break the declarative model and make debugging painful. Configuration management is complex, and Ansible has spent years solving those problems.

### "Can't I just use Ansible for everything?"

Also technically yes, but you'll lose state management, drift detection, and automatic dependency handling. Managing infrastructure lifecycle in Ansible becomes unwieldy as your environment grows.

### "What about Terraform's `null_resource` with `local-exec`?"

This is a legitimate pattern for calling Ansible *after* Terraform completes. Just don't use it to replace proper configuration management throughout your Terraform code.

### "What about Packer for VM images?"

Great question! Packer fits nicely into this workflow:
1. **Packer**: Creates base VM images (AMIs) with common software pre-installed
2. **Terraform**: Provisions infrastructure using those images
3. **Ansible**: Handles application-specific configuration and deployment

## Key Takeaways

✅ **Use Terraform for:**
- Creating infrastructure
- Managing resource lifecycle
- Tracking state
- Handling dependencies

✅ **Use Ansible for:**
- Installing software
- Configuring systems
- Deploying applications
- Day-2 operations

❌ **Don't use Terraform for:**
- Configuration management
- Installing software packages
- Managing files on servers
- Application deployments

❌ **Don't use Ansible for:**
- Provisioning cloud infrastructure
- Managing infrastructure state
- Complex resource dependencies
- Infrastructure lifecycle management

## Conclusion

The Terraform vs Ansible debate is a false dichotomy. These tools are complementary, not competitive. Use Terraform to build the foundation, and use Ansible to make it useful.

Think of it like building a house:
- **Terraform** is your construction crew—they pour the foundation, frame the walls, install plumbing
- **Ansible** is your interior decorator—they paint, install furniture, configure the smart home system

You need both to have a finished, livable house.

By understanding what each tool does best and avoiding common anti-patterns, you'll build a robust, maintainable infrastructure automation pipeline that plays to the strengths of both tools.

---

**Want to learn more?** Check out:
- [Terraform Documentation](https://www.terraform.io/docs)
- [Ansible Documentation](https://docs.ansible.com/)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)

*Have questions or want to share your Terraform/Ansible workflow? Drop a comment below!*