import type { QueryPack } from '../types/logs';

export const vpcFlowStarterPack: QueryPack = {
  id: 'vpc-flow-basics',
  packId: 'starter-vpc-cloudtrail',
  title: 'VPC Flow Basics',
  category: 'network',
  queries: [
    {
      id: 'top-talkers',
      title: 'Top Talkers by Bytes',
      description: 'Identify source/destination pairs with highest total bytes.',
      category: 'network',
      tags: ['vpc', 'network', 'topn'],
      sql: `
        SELECT
          srcaddr AS src_ip,
          dstaddr AS dst_ip,
          SUM(bytes) AS total_bytes,
          SUM(packets) AS total_packets
        FROM vpc_flow_logs
        GROUP BY 1, 2
        ORDER BY total_bytes DESC
        LIMIT 20;
      `.trim(),
      output: {
        columns: [
          { name: 'src_ip', type: 'ip' },
          { name: 'dst_ip', type: 'ip' },
          { name: 'total_bytes', type: 'integer' },
          { name: 'total_packets', type: 'integer' },
        ],
      },
    },
    {
      id: 'denied-connections',
      title: 'Denied Connections by Source',
      description: "Flow log entries with action = 'REJECT' grouped by src.",
      category: 'network',
      tags: ['vpc', 'reject', 'security'],
      sql: `
        SELECT srcaddr AS src_ip, COUNT(*) AS denied_count
        FROM vpc_flow_logs
        WHERE action = 'REJECT'
        GROUP BY 1
        ORDER BY denied_count DESC
        LIMIT 50;
      `.trim(),
      output: {
        columns: [
          { name: 'src_ip', type: 'ip' },
          { name: 'denied_count', type: 'integer' },
        ],
      },
    },
    {
      id: 'port-protocol-dist',
      title: 'Port & Protocol Distribution',
      description: 'Top destination ports and L4 protocols by volume.',
      category: 'overview',
      tags: ['vpc', 'ports'],
      sql: `
        SELECT protocol, dstport, COUNT(*) AS c
        FROM vpc_flow_logs
        GROUP BY 1, 2
        ORDER BY c DESC
        LIMIT 50;
      `.trim(),
      output: {
        columns: [
          { name: 'protocol', type: 'integer' },
          { name: 'dstport', type: 'integer' },
          { name: 'c', type: 'integer' },
        ],
      },
    },
  ],
};

