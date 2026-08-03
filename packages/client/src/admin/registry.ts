import { AnalyticsEventsAdmin } from "./components/analytics/AnalyticsEventsAdmin";
import { AuthSettingsForm } from "./components/auth-settings/AuthSettingsForm";
import { ContentEntryAdmin } from "./components/content/ContentEntryAdmin";
import { FeatureFlagsAdmin } from "./components/flags/FeatureFlagsAdmin";
import { LayoutEntryAdmin } from "./components/layout/LayoutEntryAdmin";
import { LoginBrandingForm } from "./components/layout/LoginBrandingForm";
import { PageEntryAdmin } from "./components/pages/PageEntryAdmin";
import { PageTreeAdmin } from "./components/pages/PageTreeAdmin";
import { SessionReplayAdmin } from "./components/replay/SessionReplayAdmin";
import { AdminHome } from "./components/shell/AdminHome";
import { AdminShell } from "./components/shell/AdminShell";
import { AccountSecurityForm } from "./components/team/AccountSecurityForm";
import { ScopeAdminForm } from "./components/team/ScopeAdminForm";
import { UsersAdminForm } from "./components/team/UsersAdminForm";

export { AnalyticsEventsAdmin } from "./components/analytics/AnalyticsEventsAdmin";
export { AuthSettingsForm } from "./components/auth-settings/AuthSettingsForm";
export { ContentEntryAdmin } from "./components/content/ContentEntryAdmin";
export { FeatureFlagsAdmin } from "./components/flags/FeatureFlagsAdmin";
export { LayoutEntryAdmin } from "./components/layout/LayoutEntryAdmin";
export { LoginBrandingForm } from "./components/layout/LoginBrandingForm";
export { PageEntryAdmin } from "./components/pages/PageEntryAdmin";
export { PageTreeAdmin } from "./components/pages/PageTreeAdmin";
export { SessionReplayAdmin } from "./components/replay/SessionReplayAdmin";
export { AdminHome } from "./components/shell/AdminHome";
export { AdminNav } from "./components/shell/AdminNav";
export { AdminPageHeader } from "./components/shell/AdminPageHeader";
export { AdminShell } from "./components/shell/AdminShell";
export { AccountSecurityForm } from "./components/team/AccountSecurityForm";
export { ScopeAdminForm } from "./components/team/ScopeAdminForm";
export { UsersAdminForm } from "./components/team/UsersAdminForm";

/** json-render component map for platform admin panels. */
export const adminComponents = {
  AdminShell,
  AuthSettingsForm,
  LoginBrandingForm,
  AccountSecurityForm,
  UsersAdminForm,
  ScopeAdminForm,
  FeatureFlagsAdmin,
  ContentEntryAdmin,
  LayoutEntryAdmin,
  PageEntryAdmin,
  PageTreeAdmin,
  AdminHome,
  SessionReplayAdmin,
  AnalyticsEventsAdmin,
};
