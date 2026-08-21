import type { RegisteredAgent } from "../../../auth/agents";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { CatalogSubmit } from "../../../core/use-catalog-submit";
import type { AgentsAdminLabels } from "./agents-admin-labels";

type CreateTaskFormProps = {
  labels: AgentsAdminLabels;
  catalog: CatalogSubmit;
  creatableAgents: RegisteredAgent[];
  taskPrompt: string;
  setTaskPrompt: (value: string) => void;
  taskAgentId: string;
  setTaskAgentId: (value: string) => void;
};

export function CreateTaskForm({
  labels,
  catalog,
  creatableAgents,
  taskPrompt,
  setTaskPrompt,
  taskAgentId,
  setTaskAgentId,
}: CreateTaskFormProps) {
  const { submit, pending, reset } = catalog;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">{labels.createTaskSectionTitle}</h3>
        <p className="text-sm text-muted-foreground">{labels.createTaskSectionDescription}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="task-prompt">{labels.taskPromptLabel}</Label>
          <Input
            id="task-prompt"
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            placeholder="Summarize last week's signups and draft a hero layout"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-agent">{labels.taskAgentLabel}</Label>
          <select
            id="task-agent"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={taskAgentId}
            onChange={(e) => setTaskAgentId(e.target.value)}
          >
            {creatableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label} ({agent.slug})
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button
        type="button"
        disabled={pending || !taskPrompt.trim() || !taskAgentId}
        onClick={() => {
          reset();
          void submit({
            action: "createAgentTask",
            params: {
              prompt: taskPrompt.trim(),
              registeredAgentId: taskAgentId,
              type: "orchestrate",
            },
            successMessage: labels.createTaskSuccessMessage,
            onSuccess: () => setTaskPrompt(""),
          });
        }}
      >
        {pending ? labels.creatingTaskLabel : labels.createTaskLabel}
      </Button>
    </div>
  );
}
