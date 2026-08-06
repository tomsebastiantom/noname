import type { AgentTask } from "../../auth/agents";

export type AgentThreadEntry = {
  id: string;
  role: "user";
  content: string;
  taskId: string;
  at: string;
};

export function filterAgentTasksSince(
  tasks: AgentTask[],
  clearedAt: string | null | undefined,
): AgentTask[] {
  if (!clearedAt) return tasks;
  const cutoff = new Date(clearedAt).getTime();
  if (Number.isNaN(cutoff)) return tasks;
  return tasks.filter((task) => new Date(task.createdAt).getTime() > cutoff);
}

export function agentThreadFromTasks(tasks: AgentTask[]): {
  thread: AgentThreadEntry[];
  tasksById: Record<string, AgentTask>;
} {
  const sorted = [...tasks].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  const thread = sorted.map((task) => ({
    id: task.id,
    role: "user" as const,
    content: task.prompt,
    taskId: task.id,
    at: task.createdAt,
  }));
  const tasksById = Object.fromEntries(sorted.map((task) => [task.id, task]));
  return { thread, tasksById };
}
