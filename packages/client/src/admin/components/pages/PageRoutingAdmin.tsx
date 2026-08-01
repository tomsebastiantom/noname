import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import { isPageTreePath } from "../../routing-entries";
import { PageEntryAdmin } from "./PageEntryAdmin";
import { PageTreeAdmin } from "./PageTreeAdmin";

type PageRoutingConfig = {
  locale: string;
};

type PageRoutingLabels = {
  title: string;
  description: string | null;
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

export function PageRoutingAdmin(
  props: ComponentCtx<CatalogProps<PageRoutingConfig, PageRoutingLabels>>,
) {
  const { config, labels } = props.props;

  if (isPageTreePath(window.location.pathname)) {
    return (
      <PageTreeAdmin
        props={{
          config: { locale: config.locale },
          labels: {
            title: labels.title,
            description: labels.description,
            saveTreeLabel: labels.saveTreeLabel,
            savingTreeLabel: labels.savingTreeLabel,
            treeSavedMessage: labels.treeSavedMessage,
            addEntryLabel: labels.addEntryLabel,
            removeEntryLabel: labels.removeEntryLabel,
            pageDocumentsLinkLabel: labels.pageDocumentsLinkLabel,
            treeLoadingLabel: labels.treeLoadingLabel,
          },
        }}
        emit={props.emit}
      />
    );
  }
  return (
    <PageEntryAdmin
      props={{
        config: {},
        labels: {
          title: labels.title,
          description: labels.description,
          saveLabel: labels.saveLabel,
          savingLabel: labels.savingLabel,
          pageSavedMessage: labels.pageSavedMessage,
          createLabel: labels.createLabel,
          creatingLabel: labels.creatingLabel,
          loadingLabel: labels.loadingLabel,
          editUrlTreeLabel: labels.editUrlTreeLabel,
          allPagesLinkLabel: labels.allPagesLinkLabel,
          urlTreeLinkLabel: labels.urlTreeLinkLabel,
        },
      }}
      emit={props.emit}
    />
  );
}
