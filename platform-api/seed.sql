-- SHART.CLOUD CTF Sample Questions
-- Run after schema.sql to populate with test data

-- Phase 1: Reconnaissance
INSERT OR REPLACE INTO questions (id, phase_id, question_number, question_text, answer, base_points, hints) VALUES
('q1-1', 'shart-cloud-phase-1', 1, 
 'What is the name of the Kubernetes namespace where customer workloads run?', 
 'customer-workloads', 
 10, 
 '[{"text": "Try listing all namespaces with kubectl", "cost": 2}, {"text": "Look for namespaces that aren''t system-related", "cost": 3}]'),

('q1-2', 'shart-cloud-phase-1', 2, 
 'What is the email address found in the exposed ConfigMap in the default namespace?', 
 'admin@shart.cloud', 
 10, 
 '[{"text": "ConfigMaps can contain sensitive data by mistake", "cost": 2}, {"text": "kubectl get configmaps -n default -o yaml", "cost": 3}]'),

('q1-3', 'shart-cloud-phase-1', 3, 
 'What is the value of the AWS_REGION environment variable in the backup-operator deployment?', 
 'us-east-1', 
 15, 
 '[{"text": "Check the deployments in the backup namespace", "cost": 3}, {"text": "kubectl describe deployment backup-operator -n backup", "cost": 5}]'),

('q1-4', 'shart-cloud-phase-1', 4, 
 'What version of Kubernetes is the cluster running?', 
 '1.28.3', 
 5, 
 '[{"text": "kubectl version gives you this info", "cost": 1}]');

-- Phase 2: Privilege Escalation  
INSERT OR REPLACE INTO questions (id, phase_id, question_number, question_text, answer, base_points, hints) VALUES
('q2-1', 'shart-cloud-phase-2', 1, 
 'What is the name of the ServiceAccount that has overly permissive RBAC roles?', 
 'backup-operator', 
 15, 
 '[{"text": "Look at ClusterRoleBindings", "cost": 3}, {"text": "kubectl get clusterrolebindings -o wide | grep -v system", "cost": 5}]'),

('q2-2', 'shart-cloud-phase-2', 2, 
 'What is the name of the Secret containing AWS credentials in the backup namespace?', 
 'aws-backup-credentials', 
 20, 
 '[{"text": "Secrets in backup-related namespaces often contain cloud creds", "cost": 4}, {"text": "kubectl get secrets -n backup", "cost": 6}]'),

('q2-3', 'shart-cloud-phase-2', 3, 
 'What is the AWS Access Key ID found in the backup credentials?', 
 'AKIAIOSFODNN7EXAMPLE', 
 25, 
 '[{"text": "Decode the secret data from base64", "cost": 5}, {"text": "kubectl get secret aws-backup-credentials -n backup -o jsonpath=''{.data.AWS_ACCESS_KEY_ID}'' | base64 -d", "cost": 8}]');

-- Phase 3: The Heist
INSERT OR REPLACE INTO questions (id, phase_id, question_number, question_text, answer, base_points, hints) VALUES
('q3-1', 'shart-cloud-phase-3', 1, 
 'What is the name of the S3 bucket containing customer backups?', 
 'shart-cloud-velero-backups', 
 20, 
 '[{"text": "Use the AWS credentials you found", "cost": 4}, {"text": "aws s3 ls with the stolen credentials", "cost": 6}]'),

('q3-2', 'shart-cloud-phase-3', 2, 
 'What is the flag hidden in the file IMPORTANT_CUSTOMER_DATA.txt in the backup bucket?', 
 'FLAG{backup_buckets_are_goldmines}', 
 30, 
 '[{"text": "Download files from the backup bucket", "cost": 6}, {"text": "aws s3 cp s3://shart-cloud-velero-backups/IMPORTANT_CUSTOMER_DATA.txt -", "cost": 10}]'),

('q3-3', 'shart-cloud-phase-3', 3, 
 'What is the database password found in the customer-secrets backup file?', 
 'SuperSecretP@ssw0rd!', 
 25, 
 '[{"text": "Customer secrets might be backed up alongside other data", "cost": 5}, {"text": "Look for files containing ''secret'' in the name", "cost": 8}]');

-- Phase 4: Total Compromise
INSERT OR REPLACE INTO questions (id, phase_id, question_number, question_text, answer, base_points, hints) VALUES
('q4-1', 'shart-cloud-phase-4', 1, 
 'What is the name of the Azure Storage Account connected to the cluster?', 
 'shartcloudbackups', 
 20, 
 '[{"text": "The cluster might have multi-cloud connections", "cost": 4}, {"text": "Look for Azure credentials in secrets", "cost": 6}]'),

('q4-2', 'shart-cloud-phase-4', 2, 
 'What is the root password for the TrueNAS system found in the infrastructure secrets?', 
 'TrueN@S_R00t_2024!', 
 35, 
 '[{"text": "Infrastructure management credentials are often stored in K8s", "cost": 7}, {"text": "Check secrets in the infrastructure or system namespaces", "cost": 10}]'),

('q4-3', 'shart-cloud-phase-4', 3, 
 'What is the Cloudflare API token found that allows DNS modifications?', 
 'cf_token_EXAMPLE_1234567890abcdef', 
 40, 
 '[{"text": "Cloudflare Tunnel credentials might be stored in the cluster", "cost": 8}, {"text": "kubectl get secrets -A | grep -i cloudflare", "cost": 12}]'),

('q4-4', 'shart-cloud-phase-4', 4, 
 'Submit the final flag from the RANSOM_NOTE.txt that appears after full compromise', 
 'FLAG{domestic_cyber_division_wins}', 
 50, 
 '[{"text": "The ransom note appears in a specific location after you have all the keys", "cost": 10}, {"text": "Check /tmp/RANSOM_NOTE.txt on the control plane node", "cost": 15}]');
