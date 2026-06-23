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

  async pull(_since: number): Promise<ReplicaRow[]> {
    return [];
  }

  async pullBatch(_kinds: string[], _since: number): Promise<ReplicaRow[]> {
    return [];
  }

  async listTargets(): Promise<{ remote: string; maxHlc: Hlc | null }[]> {
    return [];
  }

  async putKey(): Promise<void> {}

  async getKey(): Promise<ReplicaKeyRow | null> {
    return null;
  }
}
