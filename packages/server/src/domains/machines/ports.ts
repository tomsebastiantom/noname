export interface MachineDefinition {
  name: string;
  initial: string;
  states: Record<string, MachineState>;
}

export interface MachineState {
  on?: Record<string, MachineTransition>;
  entry?: string[];
  exit?: string[];
  final?: boolean;
}

export interface MachineTransition {
  target: string;
  guard?: GuardDefinition;
  actions?: string[];
}

export interface GuardDefinition {
  type: string;
  params?: Record<string, unknown>;
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

export interface TransitionResult {
  success: boolean;
  fromState: string;
  toState: string;
  guardResult?: GuardResult;
  error?: string;
}

export interface GuardResult {
  passed: boolean;
  name: string;
  reason?: string;
}

export interface MachineStorage {
  findDefinition(tenantId: string, name: string): Promise<MachineDefinition | null>;
  saveDefinition(tenantId: string, definition: MachineDefinition): Promise<MachineDefinition>;
  listDefinitions(tenantId: string): Promise<MachineDefinition[]>;

  createInstance(tenantId: string, machineName: string, initialState: string, context: Record<string, unknown>): Promise<MachineInstanceDTO>;
  findInstance(tenantId: string, id: string): Promise<MachineInstanceDTO | null>;
  updateInstance(instance: MachineInstanceDTO): Promise<MachineInstanceDTO>;
  listInstances(tenantId: string): Promise<MachineInstanceDTO[]>;

  logTransition(
    instanceId: string,
    event: string,
    result: TransitionResult,
    params: Record<string, unknown>,
  ): Promise<void>;
  listTransitions(instanceId: string): Promise<TransitionRecord[]>;
}

export interface TransitionRecord {
  id: string;
  instanceId: string;
  event: string;
  fromState: string;
  toState: string;
  params: Record<string, unknown>;
  guardResult: Record<string, unknown>;
  success: boolean;
  error?: string;
  createdAt: Date;
}

export interface GuardContext {
  instance: MachineInstanceDTO;
  params: Record<string, unknown>;
  definition: MachineDefinition;
}

export interface Guard {
  (ctx: GuardContext): Promise<GuardResult> | GuardResult;
}

export interface MachineEngine {
  load(tenantId: string, name: string): Promise<MachineDefinition>;
  define(tenantId: string, definition: MachineDefinition): Promise<MachineDefinition>;
  start(tenantId: string, machineName: string, context: Record<string, unknown>): Promise<MachineInstanceDTO>;
  transition(tenantId: string, instanceId: string, event: string, params?: Record<string, unknown>): Promise<MachineInstanceDTO>;
  listInstances(tenantId: string): Promise<MachineInstanceDTO[]>;
  getInstance(tenantId: string, id: string): Promise<MachineInstanceDTO | null>;
}
