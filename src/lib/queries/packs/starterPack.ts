import type { QueryPack } from '../../types/logs';
import { vpcFlowStarterPack } from '../vpcFlowPresets';
import { cloudTrailStarterPack } from '../cloudTrailPresets';

export const starterQueryPacks: QueryPack[] = [vpcFlowStarterPack, cloudTrailStarterPack];

