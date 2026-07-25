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
  orgId: string;
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
  findDefinition(orgId: string, name: string): Promise<MachineDefinition | null>;
  saveDefinition(orgId: string, definition: MachineDefinition): Promise<MachineDefinition>;
  listDefinitions(orgId: string): Promise<MachineDefinition[]>;

  createInstance(
    orgId: string,
    machineName: string,
    initialState: string,
    context: Record<string, unknown>,
  ): Promise<MachineInstanceDTO>;
  findInstance(orgId: string, id: string): Promise<MachineInstanceDTO | null>;
  updateInstance(instance: MachineInstanceDTO): Promise<MachineInstanceDTO>;
  listInstances(orgId: string): Promise<MachineInstanceDTO[]>;

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

export type Guard = (ctx: GuardContext) => Promise<GuardResult> | GuardResult;

export interface MachineEngine {
  load(orgId: string, name: string): Promise<MachineDefinition>;
  define(orgId: string, definition: MachineDefinition): Promise<MachineDefinition>;
  start(
    orgId: string,
    machineName: string,
    context: Record<string, unknown>,
  ): Promise<MachineInstanceDTO>;
  transition(
    orgId: string,
    instanceId: string,
    event: string,
    params?: Record<string, unknown>,
  ): Promise<MachineInstanceDTO>;
  listInstances(orgId: string): Promise<MachineInstanceDTO[]>;
  getInstance(orgId: string, id: string): Promise<MachineInstanceDTO | null>;
}
