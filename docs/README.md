# DemoMart documentation

Configuration guides and API references for the DemoMart Team Portal.

## Start here

[Solution overview](SOLUTION-OVERVIEW.md) explains the account lifecycle, system responsibilities and supported scope.

## Guides and references

| Document | Contents |
| --- | --- |
| [SAML SSO](AUTH0-SETUP.md) | Auth0 trust configuration, assignment and attribute mapping |
| [SCIM provisioning](SCIM-FIRST-EXERCISE.md) | Account creation, listing, updates and response codes |
| [Identity lifecycle](SCIM-SAML-LINKING.md) | Account ownership, linking rules and access behavior |
| [Administrative API](ADMIN-LINK-API.md) | Identity-link request, authentication and conflict handling |
| [GraphQL metrics](GRAPHQL-METRICS.md) | Schema, queries, field selection and errors |
| [Store sales](SALES.md) | Protected sale creation, store isolation and storage |
| [Data and deployment](POSTGRESQL.md) | Storage model, environment configuration and persistence |

## Request conventions

Examples use fictional records and environment placeholders:

| Placeholder | Value |
| --- | --- |
| `{{baseUrl}}` | Application URL |
| `{{userId}}` | Account ID returned by SCIM |
| `{{auth0UserId}}` | Corresponding Auth0 user ID |
| `{{scimToken}}` | Provisioning credential |
| `{{adminToken}}` | Separate administrative credential |

These references describe the implemented application, including its limitations. They do not imply full support for every feature of SAML or SCIM.

[Back to project](../README.md)
