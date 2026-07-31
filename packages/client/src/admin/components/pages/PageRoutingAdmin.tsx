import type { ComponentCtx } from "../../../core/components/types";
import { isPageTreePath } from "../../routing-entries";
import { PageEntryAdmin } from "./PageEntryAdmin";
import { PageTreeAdmin } from "./PageTreeAdmin";

type PageRoutingAdminProps = {
  title: string;
  description: string | null;
  locale: string;
  saveLabel: string;
  savingLabel: string;
  pageSavedMessage: string;
  createLabel: string;
  creatingLabel: string;
  loadingLabel: string;
  editUrlTreeLabel: string;
  allPagesLinkLabel: string;
  urlTreeLinkLabel: string;
  saveTreeLabel: string;
  savingTreeLabel: string;
  treeSavedMessage: string;
  addEntryLabel: string;
  removeEntryLabel: string;
  pageDocumentsLinkLabel: string;
  treeLoadingLabel: string;
};

export function PageRoutingAdmin(props: ComponentCtx<PageRoutingAdminProps>) {
  if (isPageTreePath(window.location.pathname)) {
    return (
      <PageTreeAdmin
        props={{
          title: props.props.title,
          description: props.props.description,
          locale: props.props.locale,
          saveTreeLabel: props.props.saveTreeLabel,
          savingTreeLabel: props.props.savingTreeLabel,
          treeSavedMessage: props.props.treeSavedMessage,
          addEntryLabel: props.props.addEntryLabel,
          removeEntryLabel: props.props.removeEntryLabel,
          pageDocumentsLinkLabel: props.props.pageDocumentsLinkLabel,
          treeLoadingLabel: props.props.treeLoadingLabel,
        }}
        emit={props.emit}
      />
    );
  }
  return (
    <PageEntryAdmin
      props={{
        title: props.props.title,
        description: props.props.description,
        saveLabel: props.props.saveLabel,
        savingLabel: props.props.savingLabel,
        pageSavedMessage: props.props.pageSavedMessage,
        createLabel: props.props.createLabel,
        creatingLabel: props.props.creatingLabel,
        loadingLabel: props.props.loadingLabel,
        editUrlTreeLabel: props.props.editUrlTreeLabel,
        allPagesLinkLabel: props.props.allPagesLinkLabel,
        urlTreeLinkLabel: props.props.urlTreeLinkLabel,
      }}
      emit={props.emit}
    />
  );
}
