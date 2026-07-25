import { isPageTreePath } from "../../admin/routing-entries";
import { PageEntryAdmin } from "./PageEntryAdmin";
import { PageTreeAdmin } from "./PageTreeAdmin";
import type { ComponentCtx } from "./types";

export function PageRoutingAdmin(
  props: ComponentCtx<{
    title: string;
    description: string | null;
    locale: string;
  }>,
) {
  if (isPageTreePath(window.location.pathname)) {
    return <PageTreeAdmin props={props.props} emit={props.emit} />;
  }
  return (
    <PageEntryAdmin
      props={{ title: props.props.title, description: props.props.description }}
      emit={props.emit}
    />
  );
}
