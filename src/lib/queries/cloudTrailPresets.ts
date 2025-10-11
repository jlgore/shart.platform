import type { QueryPack } from '../types/logs';

export const cloudTrailStarterPack: QueryPack = {
  id: 'cloudtrail-basics',
  packId: 'starter-vpc-cloudtrail',
  title: 'CloudTrail Basics',
  category: 'iam',
  queries: [
    {
      id: 'error-events',
      title: 'Error Events by Name',
      description: 'Top events with errors observed in CloudTrail.',
      category: 'errors',
      tags: ['cloudtrail', 'errors'],
      sql: `
        SELECT eventName, COUNT(*) AS error_count
        FROM cloudtrail_events
        WHERE errorCode IS NOT NULL
        GROUP BY 1
        ORDER BY error_count DESC
        LIMIT 20;
      `.trim(),
      output: {
        columns: [
          { name: 'eventName', type: 'string' },
          { name: 'error_count', type: 'integer' },
        ],
      },
    },
    {
      id: 'iam-sensitive-actions',
      title: 'IAM-Sensitive Actions',
      description: 'Commonly sensitive IAM or policy changes.',
      category: 'iam',
      tags: ['iam', 'security'],
      sql: `
        SELECT eventTime AS timestamp, userIdentity.userName AS user, eventName, awsRegion
        FROM cloudtrail_events
        WHERE eventName IN (
          'CreateUser','AttachRolePolicy','PutBucketPolicy','PutUserPolicy','CreateAccessKey','UpdateAssumeRolePolicy'
        )
        ORDER BY timestamp DESC
        LIMIT 100;
      `.trim(),
      output: {
        columns: [
          { name: 'timestamp', type: 'timestamp' },
          { name: 'user', type: 'string' },
          { name: 'eventName', type: 'string' },
          { name: 'awsRegion', type: 'string' },
        ],
      },
    },
    {
      id: 'rare-events',
      title: 'Rare Events (Top Outliers)',
      description: 'Events that appear infrequently by daily count.',
      category: 'anomalies',
      tags: ['anomaly'],
      sql: `
        WITH counts AS (
          SELECT date_trunc('day', eventTime) AS day, eventName, COUNT(*) AS c
          FROM cloudtrail_events
          GROUP BY 1,2
        )
        SELECT eventName, MIN(c) AS min_daily, MAX(c) AS max_daily, AVG(c) AS avg_daily
        FROM counts
        GROUP BY 1
        ORDER BY min_daily ASC, avg_daily ASC
        LIMIT 50;
      `.trim(),
      output: {
        columns: [
          { name: 'eventName', type: 'string' },
          { name: 'min_daily', type: 'integer' },
          { name: 'max_daily', type: 'integer' },
          { name: 'avg_daily', type: 'number' },
        ],
      },
    },
  ],
};

