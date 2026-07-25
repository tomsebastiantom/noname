import { AggregateRoot } from "../../shared/aggregate-root";
import { AgentEvents } from "./events";
import type { AgentTaskDTO, AgentTaskStatus, AgentTaskType } from "./ports";

export class AgentTask extends AggregateRoot {
  constructor(
    public readonly id: string,
    public readonly orgId: string,
    public readonly type: AgentTaskType,
    public status: AgentTaskStatus,
    public readonly prompt: string,
    public input: Record<string, unknown>,
    public output: Record<string, unknown> | null,
    public error: string | null,
    public model: string | null,
    public tokens: number | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {
    super();
  }

  static create(
    orgId: string,
    type: AgentTaskType,
    prompt: string,
    input: Record<string, unknown>,
  ): AgentTask {
    const task = new AgentTask(
      crypto.randomUUID(),
      orgId,
      type,
      "pending",
      prompt,
      input,
      null,
      null,
      null,
      null,
      new Date(),
      new Date(),
    );
    task.apply(AgentEvents.CREATED, {
      taskId: task.id,
      orgId,
      type,
    });
    return task;
  }

  start(): void {
    this.status = "running";
    this.updatedAt = new Date();
    this.apply(AgentEvents.STARTED, {
      taskId: this.id,
      orgId: this.orgId,
    });
  }

  complete(output: Record<string, unknown>, model: string, tokens: number): void {
    this.status = "completed";
    this.output = output;
    this.model = model;
    this.tokens = tokens;
    this.updatedAt = new Date();
    this.apply(AgentEvents.COMPLETED, {
      taskId: this.id,
      orgId: this.orgId,
      type: this.type,
    });
  }

  fail(error: string): void {
    this.status = "failed";
    this.error = error;
    this.updatedAt = new Date();
    this.apply(AgentEvents.FAILED, {
      taskId: this.id,
      orgId: this.orgId,
      error,
    });
  }

  approve(): void {
    this.status = "approved";
    this.updatedAt = new Date();
    this.apply(AgentEvents.APPROVED, {
      taskId: this.id,
      orgId: this.orgId,
      type: this.type,
    });
  }

  reject(): void {
    this.status = "rejected";
    this.updatedAt = new Date();
    this.apply(AgentEvents.REJECTED, {
      taskId: this.id,
      orgId: this.orgId,
      type: this.type,
    });
  }

  toDTO(): AgentTaskDTO {
    return {
      id: this.id,
      orgId: this.orgId,
      type: this.type,
      status: this.status,
      prompt: this.prompt,
      input: this.input,
      output: this.output,
      error: this.error,
      model: this.model,
      tokens: this.tokens,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromDTO(dto: AgentTaskDTO): AgentTask {
    return new AgentTask(
      dto.id,
      dto.orgId,
      dto.type,
      dto.status,
      dto.prompt,
      dto.input,
      dto.output,
      dto.error,
      dto.model,
      dto.tokens,
      dto.createdAt,
      dto.updatedAt,
    );
  }
}
