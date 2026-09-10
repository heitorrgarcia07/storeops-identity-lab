// Paste into an Auth0 Post Login Action (Auth0 uses exports, independently of this project's ESM).
// Set Action secret STOREOPS_CLIENT_ID to the Client ID of this lab application.
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.STOREOPS_CLIENT_ID) return;
  const metadata = event.user.app_metadata || {};
  if (metadata.storeops_access !== true || !['101', '102'].includes(metadata.storeId)) {
    api.access.deny('StoreOps access is not assigned.');
    return;
  }
  api.samlResponse.setAttribute('email', event.user.email);
  api.samlResponse.setAttribute('displayName', event.user.name || event.user.email);
  api.samlResponse.setAttribute('storeId', metadata.storeId);
};
