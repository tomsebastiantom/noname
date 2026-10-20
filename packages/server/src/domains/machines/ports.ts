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
  /** Monotonic optimistic-concurrency revision; absent only in legacy test adapters. */
  revision?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MachineInstanceSearch {
  machineName?: string;
  states?: string[];
  contextEquals?: Record<string, string | number | boolean>;
  contextAnyOf?: Record<string, Array<string | number | boolean>>;
  contextExists?: string[];
  search?: string;
  searchContextFields?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  contextDateField?: string;
  contextDateAfter?: Date;
  contextDateBefore?: Date;
  cursor?: string;
  limit?: number;
}

export interface MachineInstancePage {
  items: MachineInstanceDTO[];
  nextCursor: string | null;
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
  /** Atomically compare-and-swap the state and append its successful transition record. */
  commitTransition(
    instance: MachineInstanceDTO,
    expectedRevision: number,
    event: string,
    result: TransitionResult,
    params: Record<string, unknown>,
  ): Promise<MachineInstanceDTO>;
  listInstances(orgId: string): Promise<MachineInstanceDTO[]>;
  searchInstances?(orgId: string, query: MachineInstanceSearch): Promise<MachineInstancePage>;

  logTransition(
    instanceId: string,
    event: string,
    result: TransitionResult,
    params: Record<string, unknown>,
  ): Promise<void>;
  listTransitions(instanceId: string): Promise<TransitionRecord[]>;

  /**
   * Delivery bookkeeping for the transition log, so a committed transition whose publish was lost can
   * be re-published from the log itself. `revision` is unique per instance, making
   * `(instanceId, revision)` a natural key.
   */
  markTransitionPublished(instanceId: string, revision: number): Promise<void>;

  /** Transitions committed before `olderThan` that have not been published yet, oldest first. */
  listUnpublishedTransitions(limit: number, olderThan: Date): Promise<PendingTransition[]>;
}

/** A committed transition awaiting (re)publication. Mirrors the event payload published live. */
export interface PendingTransition {
  id: string;
  instanceId: string;
  orgId: string | null;
  revision: number | null;
  event: string;
  fromState: string;
  toState: string;
  params: Record<string, unknown>;
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
  listDefinitions(orgId: string): Promise<MachineDefinition[]>;
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
    expectedRevision?: number,
  ): Promise<MachineInstanceDTO>;
  listInstances(orgId: string): Promise<MachineInstanceDTO[]>;
  searchInstances(orgId: string, query: MachineInstanceSearch): Promise<MachineInstancePage>;
  getInstance(orgId: string, id: string): Promise<MachineInstanceDTO | null>;
  /** Replay the awaited post-persistence hook only for a matching successful stored transition. */
  replayPersistedTransition?(
    orgId: string,
    instanceId: string,
    event: string,
    expectedParams: Record<string, unknown>,
    expectedFinalState: string,
    expectedFromState?: string,
  ): Promise<boolean>;
}
