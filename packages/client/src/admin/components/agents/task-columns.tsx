import type { useActions } from "@json-render/react";
import type { AgentTask } from "../../../auth/agents";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { CatalogSubmit } from "../../../core/use-catalog-submit";
import type { DataTableColumn } from "../shared/DataTable";
import type { AgentsAdminLabels } from "./agents-admin-labels";

type TaskColumnsProps = {
  labels: AgentsAdminLabels;
  catalog: CatalogSubmit;
  selectedTaskId: string | null | undefined;
  execute: ReturnType<typeof useActions>["execute"];
  canReviewTask: (task: AgentTask) => boolean;
};

export function formatReviewer(task: AgentTask): string | null {
  const record = task.approvedBy ?? task.rejectedBy;
  if (!record) return null;
  const when = new Date(record.at).toLocaleString();
  return `${record.actorId} · ${when}`;
}

export function taskColumns({
  labels,
  catalog,
  selectedTaskId,
  execute,
  canReviewTask,
}: TaskColumnsProps): DataTableColumn<AgentTask>[] {
  const { submit, pending, reset } = catalog;

  return [
    { key: "type", header: labels.typeColumnHeader, cell: (row) => row.type },
    {
      key: "status",
      header: labels.statusColumnHeader,
      cell: (row) => (
        <Badge variant={row.status === "running" ? "default" : "secondary"}>{row.status}</Badge>
      ),
    },
    {
      key: "prompt",
      header: labels.promptColumnHeader,
      cell: (row) => <span className="line-clamp-2 max-w-md text-sm">{row.prompt}</span>,
    },
    {
      key: "reviewedBy",
      header: labels.reviewedByColumnHeader,
      cell: (row) => {
        const reviewer = formatReviewer(row);
        return reviewer ? <span className="text-xs text-muted-foreground">{reviewer}</span> : "—";
      },
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedTaskId === row.id ? "default" : "outline"}
            disabled={pending}
            onClick={() => {
              void execute({ action: "selectAgentTask", params: { taskId: row.id } });
            }}
          >
            {labels.viewTaskLabel}
          </Button>
          {row.status === "completed" && canReviewTask(row) ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  reset();
                  void submit({
                    action: "approveAgentTask",
                    params: { taskId: row.id },
                    successMessage: labels.taskApprovedMessage,
                  });
                }}
              >
                {labels.approveLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  reset();
                  void submit({
                    action: "rejectAgentTask",
                    params: { taskId: row.id },
                    successMessage: labels.taskRejectedMessage,
                  });
                }}
              >
                {labels.rejectLabel}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];
}
