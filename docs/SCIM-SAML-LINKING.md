# Link a provisioned account to Auth0

Use the local account id returned by SCIM and the user_id copied from the correct Auth0 user. The script uses IDP_ISSUER from .env. This is a manual administrative exercise: no automatic IdP provisioning or email-based matching is performed.

Stop the server in VS Code with Control+C. Preview:

```sh
./scripts/local.sh link-user LOCAL_USER_ID 'auth0|USER_ID'
```

Check the account name, store and identity. Run the same command with `--apply` to save the link, then restart with `./scripts/local.sh start`. Quote the Auth0 identifier because `|` has special meaning in a shell.

The link updates only `users.issuer` and `users.subject`. Existing profile, store, status and account id remain unchanged. The script refuses to take an identity from another account or replace an existing different identity. Repeating the same link is safe. Close any uncommitted DB Browser edits before linking.

For linked SCIM accounts, SAML verifies identity and the local database controls the profile, store and active status. SAML does not overwrite SCIM data. Inactive accounts are refused even with JIT enabled. The current Auth0 Action still requires storeops_access=true and a valid storeId in app_metadata; keep those set for the exercise.

## Acceptance

1. Sign in as the linked Auth0 user in a private browser window to avoid an existing session for a different user. Use the same private browser context for the entire login.
2. Confirm the original SCIM id and `SCIM account preserved — SAML sign-in` in the dashboard. Event 8 says `SCIM account recognized`.
3. Change the store via SCIM. Set a different valid store in Auth0 metadata. A new login must preserve the SCIM store.
4. PATCH active=false. A fresh SAML login must fail with `Account inactive` and must not create a new account. An existing dashboard request is also blocked while inactive; previously rendered HTML is not remotely erased.
5. Restore active=true to re-enable access. This version does not permanently revoke an old session on deactivation: an unexpired session may work again after reactivation. Session revocation/versioning is a later exercise.

No real user link is performed by automated tests; they use temporary accounts and signed local fixtures.
