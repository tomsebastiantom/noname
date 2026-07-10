export interface MachineDefinition {
  name: string;
  initial: string;
  states: Record<string, {
    on?: Record<string, { target: string; guard?: string; actions?: string[] }>;
    entry?: string[];
    exit?: string[];
    invoke?: { src: string; onDone?: string; onError?: string };
  }>;
}

export interface MachineInstanceDTO {
  id: string;
  tenantId: string;
  machineName: string;
  currentState: string;
  context: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MachineEngine {
  load(name: string): Promise<MachineDefinition>;
  start(tenantId: string, machineName: string, context: Record<string, unknown>): Promise<MachineInstanceDTO>;
  transition(instanceId: string, event: string, params?: Record<string, unknown>): Promise<MachineInstanceDTO>;
}