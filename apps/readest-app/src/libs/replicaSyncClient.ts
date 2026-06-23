import type { Hlc, ReplicaRow } from '@/types/replica';

export interface ReplicaKeyRow {
  saltId: string;
  alg: string;
  salt: string;
  createdAt: string;
}

export class ReplicaSyncClient {
  async push(_rows: ReplicaRow[]): Promise<ReplicaRow[]> {
    return [];
  }

  async pull(_kind: string, _since: Hlc | null): Promise<ReplicaRow[]> {
    return [];
  }

  async pullBatch(
    _cursors: { kind: string; since: Hlc | null }[],
  ): Promise<{ kind: string; rows: ReplicaRow[] }[]> {
    return [];
  }

  async listTargets(): Promise<{ remote: string; maxHlc: Hlc | null }[]> {
    return [];
  }

  async putKey(): Promise<void> {}

  async getKey(): Promise<ReplicaKeyRow | null> {
    return null;
  }

  async listReplicaKeys(): Promise<ReplicaKeyRow[]> {
    return [];
  }

  async createReplicaKey(_alg: string): Promise<ReplicaKeyRow> {
    throw new Error('Sync not available');
  }

  async forgetReplicaKeys(): Promise<void> {}

  invalidateReplicaKeysCache(): void {}
}

export const replicaSyncClient = new ReplicaSyncClient();
