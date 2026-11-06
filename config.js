// Settings for the shared SharePoint Excel workbook — see "Setup" in README.md.
// None of these are secrets: the Microsoft sign-in and the workbook's SharePoint sharing decide who can see and edit.
window.APP_CONFIG = {
  // Microsoft Entra app registration → Overview → "Application (client) ID"
  clientId: "",
  // Microsoft Entra app registration → Overview → "Directory (tenant) ID"
  tenantId: "",
  // SharePoint link to the Excel workbook (Share → Copy link, people in your organization)
  workbookUrl: ""
};
